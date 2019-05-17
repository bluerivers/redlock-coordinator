const Redlock = require('redlock');
const EventEmitter = require('events');

const defaultOption = {
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

const Event = {
    ELECTED: 'elected',
    RESIGNED: 'resigned',
    ERROR: 'error',
};

class Coordinator extends EventEmitter {
    constructor(redis, options) {
        super();

        this.redis = redis;

        let myOption;
        let myRedlock;

        if (!options) {
            myOption = defaultOption;
        } else {
            const {
                key = defaultOption.key,
                ttl = defaultOption.ttl,
                wait = defaultOption.wait,
                renew = defaultOption.renew,
                logger = defaultOption.logger,
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

            const defaultRedlock = defaultOption.redlock;

            if (!options.redlock) {
                myRedlock = defaultRedlock;
            } else {
                ({
                    driftFactor = defaultRedlock.driftFactor,
                    retryCount = defaultRedlock.retryCount,
                    retryDelay = defaultRedlock.retryDelay,
                    retryJitter = defaultRedlock.retryJitter,
                } = options.redlock);

                myRedlock = {
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

        this.key = key;
        this.ttl = ttl;
        this.waitTime = wait;
        this.renewTime = renew;
        this.logger = logger;

        this.redlock = new Redlock(
            this.redis,
            myRedlock,
        ).on('clientError', (error) => {
            logger.error('A redis error has occurred - err: %O', error);
            throw error;
        });


        this.myLock = null;
    }


    async elect() {
        try {
            this.myLock = await this.redlock.lock(this.key, this.ttl);

            this.logger.info('[elect] I am a coordinator - value: %s, expiration time: %s',
                this.myLock.value, new Date(this.myLock.expiration));

            this.renewId = setInterval(this.renew.bind(this), this.renewTime);
            this.emit(Event.ELECTED);
        } catch (error) {
            this.myLock = null;
            if (error.name === 'LockError') {
                this.logger.debug('[elect] I am not a coordinator');
            } else {
                this.logger.error('[elect] error occurs - error: %O', error);
                this.emit(Event.ERROR, error);
            }
            this.electId = setTimeout(this.elect.bind(this), this.waitTime);
        }
    }


    isMe() {
        return !!this.myLock;
    }


    async renew() {
        if (this.isMe()) {
            // 연장
            this.logger.debug('[renew] coordinator extends expiration');
            try {
                this.myLock = await this.myLock.extend(this.ttl);
            } catch (error) {
                this.logger.error('[renew] extend fails - error: %O', error);
                this.emit(Event.ERROR, error);

                try {
                    clearInterval(this.renewId);
                    await this.myLock.unlock();
                } catch (error) {
                    this.logger.warn('[renew] unlock fails - error: %O', error);
                }

                this.myLock = null;
                this.emit(Event.RESIGNED);
            }
        } else {
            // 대기 후 시도
            this.logger.debug('[renew] non-coordinator resets renew interval');
            clearInterval(this.renewId);
            this.electId = setTimeout(this.elect.bind(this), this.waitTime);
        }
    }


    async resign() {
        this.logger.info('[resign] start resign');

        clearInterval(this.renewId);
        clearTimeout(this.electId);

        if (this.isMe()) {
            try {
                await this.myLock.unlock();
            } catch (error) {
                this.logger.error('[resign] unlock fails - error: %O', error);
                this.emit(Event.ERROR, error);
            }
        }

        this.myLock = null;

        this.logger.info('[resign] resign is complete');
        this.emit(Event.RESIGNED);
    }
}


module.exports = Coordinator;
