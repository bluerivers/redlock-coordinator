Redlock Coordinator
===========

Leader election through [Redlock](https://github.com/mike-marcacci/node-redlock)

Inspired by [redis-leader](https://github.com/pierreinglebert/redis-leader)


## Requirements

  - Redis 2.6.12

## Install

```
npm install redlock-coordinator
```

## Examples

```javascript
const Redis = require('io-redis');
const Leader = require('redlock-coordinator');

const coordinator = new Coordinator([
    new Redis( /* ... */),
], { key: 'admin:coordinator:lock', logger: getLogger('coordinator') });
```

## API

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

### new Coordinator(redis, options)

  Create a new Coordinator

  `redis` is an array of redis object like node redis, ioredis or any other compatible redis library

#### options

  `key` redis key value, default: `coordinator:redlock`
  `logger` logger, default value: `console`
  `wait` Time between 2 tries getting elected (ms), default value: `1000`
  `ttl` Lock time to live in milliseconds (will be automatically released after that time), default value: `10000`
  `renew` Renew time to expand expiration time in milliseconds, default value: `5000`
  `redlock`: options for redlock, details can be confirm on [redlock](https://github.com/mike-marcacci/node-redlock)

### elect (Promise)

  Elect coordinator


### resign (Promise)

  Stop election and resign coordinator if I am coordinator.


### isMe (Promise)

  Tells if i got elected


### Events

`elected` when your candidate become leader

`resigned` when your leader got revoked from his leadership

`error` when an error occurred, best is to exit your process


## License

  MIT
