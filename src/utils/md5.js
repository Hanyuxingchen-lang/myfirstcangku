const crypto = require('crypto');
const fs = require('fs');

// 文件MD5加密
function getFileMD5(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const md5 = crypto.createHash('md5');
    stream.on('data', (chunk) => md5.update(chunk));
    stream.on('end', () => resolve(md5.digest('hex')));
    stream.on('error', reject);
  });
}

module.exports = { getFileMD5 };