import Redlock from 'redlock';
import { EventEmitter } from 'events';
import {
  IRedlockCoordinator as CoordinatorInterface, Options, CompatibleLogger, RedlockCoordinatorEvent
} from './type';

const DEFAULT_OPTION: Options = {
  key: 'coordinator:redlock',
  logger: console,
  ttl: 10000,
  renew: 5000,
  wait: 1000,
  redlock: {
    driftFactor: 0.01,
    retryCount: 10,
    retryDelay: 200,
    retryJitter: 200,
  },
};

class RedlockCoordinator extends EventEmitter implements CoordinatorInterface {
  private redis: Redlock.CompatibleRedisClient[];

  private readonly key: string;

  private readonly ttl: number;

  private readonly waitTime: number;

  private readonly renewTime: number;

  private readonly logger: CompatibleLogger;

  private redlock: Redlock;

  private myLock: Redlock.Lock | null;

  private renewId: NodeJS.Timeout | null;
  private electId: NodeJS.Timeout | null;

  constructor(redis: Redlock.CompatibleRedisClient[], options?: Options) {
    super();

    this.redis = redis;

    let myOption;
    let myRedlockOptions: Redlock.Options;

    if (!options) {
      myOption = DEFAULT_OPTION;
      myRedlockOptions = DEFAULT_OPTION.redlock!;
    } else {
      const {
        key = DEFAULT_OPTION.key,
        ttl = DEFAULT_OPTION.ttl,
        wait = DEFAULT_OPTION.wait,
        renew = DEFAULT_OPTION.renew,
        logger = DEFAULT_OPTION.logger,
      } = options;

      myOption = {
        key,
        ttl,
        wait,
        renew,
        logger,
      };

      let driftFactor;
      let retryCount;
      let retryDelay;
      let retryJitter;

      const defaultRedlock = DEFAULT_OPTION.redlock!;

      if (!options.redlock) {
        myRedlockOptions = defaultRedlock;
      } else {
        ({
          driftFactor = defaultRedlock.driftFactor,
          retryCount = defaultRedlock.retryCount,
          retryDelay = defaultRedlock.retryDelay,
          retryJitter = defaultRedlock.retryJitter,
        } = options.redlock);

        myRedlockOptions = {
          driftFactor,
          retryCount,
          retryDelay,
          retryJitter,
        };
      }
    }

    const {
      key, ttl, wait, renew, logger,
    } = myOption;

    this.key = key!;
    this.ttl = ttl!;
    this.waitTime = wait!;
    this.renewTime = renew!;
    this.logger = logger!;

    this.redlock = new Redlock(
      this.redis,
      myRedlockOptions,
    ).on('clientError', (error) => {
      this.logger.error(`A redis error has occurred - err: ${error}`);
      this.emit(RedlockCoordinatorEvent.ERROR, { error });
    });

    this.myLock = null;
    this.renewId = null;
    this.electId = null;
  }


  elect = async (): Promise<void> => {
    try {
      this.myLock = await this.redlock.lock(this.key, this.ttl);

      this.logger.info(
        `[elect] I am a coordinator - value: ${this.myLock.value}, expiration time: ${this.myLock.expiration}`
      );

      this.renewId = setTimeout(this.renew.bind(this), this.renewTime);

      this.emit(RedlockCoordinatorEvent.ELECTED);
    } catch (error) {
      this.myLock = null;

      if (error.name === 'LockError') {
        this.logger.debug('[elect] I am not a coordinator');
      } else {
        this.logger.error(`[elect] error occurs - error: ${error}`);
        this.emit(RedlockCoordinatorEvent.ERROR, { error });
      }

      this.electId = setTimeout(this.elect.bind(this), this.waitTime);
    }
  }


  isMe = () => {
    return !!this.myLock;
  }

  renew = async () => {
    if (this.isMe()) {
      // 연장
      this.logger.debug('[renew] coordinator extends expiration');
      try {
        this.myLock = await this.myLock!.extend(this.ttl);

        this.renewId = setTimeout(this.renew.bind(this), this.renewTime);
        return;
      } catch (error) {
        this.logger.warn(`[renew] extend fails - error: ${error}`);
        this.emit(RedlockCoordinatorEvent.ERROR, { error });

        try {
          await this.myLock!.unlock();
        } catch (unlockError) {
          this.logger.warn(`[renew] unlock fails - error: ${unlockError}`);
        }

        this.myLock = null;
        this.emit(RedlockCoordinatorEvent.RESIGNED);
      }
    } else {
      this.logger.debug('[renew] non-coordinator resets renew interval');
    }

    if (this.renewId) {
      clearTimeout(this.renewId);
    }
    this.electId = setTimeout(this.elect.bind(this), this.waitTime);
  }

  resign = async () => {
    this.logger.info('[resign] start resign');

    if (this.renewId) {
      clearTimeout(this.renewId);
    }

    if (this.electId) {
      clearTimeout(this.electId);
    }

    if (this.isMe()) {
      try {
        await this.myLock!.unlock();
      } catch (error) {
        this.logger.error(`[resign] unlock fails - error: ${error}`);
        this.emit(RedlockCoordinatorEvent.ERROR, { error });
      }
    }

    this.myLock = null;

    this.logger.info('[resign] resign is complete');
    this.emit(RedlockCoordinatorEvent.RESIGNED);
  }
}

export default RedlockCoordinator;
