const fs = require('fs-extra');
const path = require('path');

// 分片存储目录
const CHUNK_DIR = path.resolve(__dirname, '../../uploads/chunk');
// 最终文件存储目录
const FILE_DIR = path.resolve(__dirname, '../../uploads/file');

// 初始化目录
fs.ensureDirSync(CHUNK_DIR);
fs.ensureDirSync(FILE_DIR);

// 合并分片文件
async function mergeFile(fileMd5, totalChunk, fileName) {
  const filePath = path.join(FILE_DIR, fileName);
  const writeStream = fs.createWriteStream(filePath);

  for (let i = 0; i < totalChunk; i++) {
    const chunkPath = path.join(CHUNK_DIR, `${fileMd5}_${i}`);
    const chunkBuffer = await fs.readFile(chunkPath);
    writeStream.write(chunkBuffer);
    await fs.remove(chunkPath);
  }

  return new Promise((resolve) => {
    writeStream.end();
    writeStream.on('finish', () => resolve(filePath));
  });
}

module.exports = { CHUNK_DIR, FILE_DIR, mergeFile };