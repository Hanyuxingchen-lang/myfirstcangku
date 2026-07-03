const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const db = require('../config/db');
const redis = require('../config/redis');
const { CHUNK_DIR, mergeFile } = require('../utils/chunk');

const upload = multer({ dest: CHUNK_DIR });

// 分片上传接口
async function chunkUpload(req, res) {
  try {
    const { fileMd5, chunkIndex, totalChunk, fileName, fileSize } = req.body;
    // Redis记录当前分片上传状态（双节点共享）
    await redis.hSet(`file:${fileMd5}`, {
      fileName,
      fileSize,
      totalChunk
    });
    // 标记当前分片已上传
    await redis.hSet(`chunk:${fileMd5}`, chunkIndex, 'done');

    res.json({ code: 200, msg: '分片上传成功' });
  } catch (err) {
    res.json({ code: 500, msg: '分片上传失败', err: err.message });
  }
}

// 校验分片、合并文件接口
async function checkAndMerge(req, res) {
  try {
    const { fileMd5 } = req.body;
    // 从Redis获取全局状态
    const fileInfo = await redis.hGetAll(`file:${fileMd5}`);
    const chunkList = await redis.hGetAll(`chunk:${fileMd5}`);

    const total = parseInt(fileInfo.totalChunk);
    const uploaded = Object.keys(chunkList).length;

    if (uploaded < total) {
      return res.json({ code: 400, msg: '文件分片未上传完成', uploaded, total });
    }

    // 合并文件
    const savePath = await mergeFile(fileMd5, total, fileInfo.fileName);
    // 写入MySQL持久化
    await db.query(`INSERT INTO file_info (file_name,file_md5,file_size,chunk_total,save_path,status) VALUES (?,?,?,?,?,2)`, [
      fileInfo.fileName,
      fileMd5,
      fileInfo.fileSize,
      total,
      savePath
    ]);

    // 清除Redis缓存
    await redis.del(`file:${fileMd5}`);
    await redis.del(`chunk:${fileMd5}`);

    res.json({ code: 200, msg: '文件上传合并完成', savePath });
  } catch (err) {
    res.json({ code: 500, msg: '合并失败', err: err.message });
  }
}

// 获取已上传分片（断点续传）
async function getUploadedChunk(req, res) {
  try {
    const { fileMd5 } = req.body;
    const chunkList = await redis.hGetAll(`chunk:${fileMd5}`);
    res.json({ code: 200, data: Object.keys(chunkList) });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败' });
  }
}

module.exports = {
  upload,
  chunkUpload,
  checkAndMerge,
  getUploadedChunk
};