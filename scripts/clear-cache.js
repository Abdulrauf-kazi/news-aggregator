const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.keys('news:*').then(keys => {
  if (keys.length > 0) {
    redis.del(...keys).then(() => {
      console.log('Cleared', keys.length, 'keys');
    }).finally(() => redis.quit());
  } else {
    console.log('No keys to clear');
    redis.quit();
  }
}).catch(e => {
  console.error(e.message);
  redis.quit();
}).finally(() => {
  process.exit(0);
});
