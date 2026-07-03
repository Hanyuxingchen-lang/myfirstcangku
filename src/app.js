const express = require('express');
const cors = require('cors');
const path = require('path');
const { upload, chunkUpload, checkAndMerge, getUploadedChunk } = require('./controller/upload');

const app = express();
const PORT = 3000;

// 全局中间件
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '../public')));

// 上传接口路由
app.post('/api/chunk/upload', upload.single('file'), chunkUpload);
app.post('/api/chunk/check', getUploadedChunk);
app.post('/api/chunk/merge', checkAndMerge);

// 启动服务
app.listen(PORT, () => {
  console.log(`分布式上传服务启动成功，端口：${PORT}`);
});