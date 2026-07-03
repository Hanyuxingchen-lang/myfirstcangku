const { createClient } = require('redis');

// 双节点统一连接本地Redis，实现状态同步
const redisClient = createClient({
  url: 'redis://127.0.0.1:6379'
});

redisClient.connect().catch(console.error);

redisClient.on('error', (err) => {
  console.log('Redis连接失败：', err);
});

module.exports = redisClient;