const fs = require('fs-extra');
const path = require('path');

const CHUNK_SIZE = 1024 * 1024 * 2;
const CHUNK_TMP_DIR = path.resolve(__dirname, '../chunks_temp');
const OUTPUT_DIR = path.resolve(__dirname, '../upload_output');
const CHUNK_EXPIRE_SEC = 24 * 60 * 60;

fs.ensureDirSync(CHUNK_TMP_DIR);
fs.ensureDirSync(OUTPUT_DIR);

async function getUploadedChunk(req, res) {
  try {
    const { fileMd5 } = req.body;
    if (!fileMd5) return res.json(global.resFormat(400, null, '缺失文件MD5参数'));
    const redisKey = `chunk:list:${fileMd5}`;
    const uploadedList = await global.redisClient.smembers(redisKey);
    return res.json(global.resFormat(200, uploadedList, '查询成功'));
  } catch (err) {
    return res.json(global.resFormat(500, null, err.message));
  }
}

async function chunkUpload(req, res) {
  try {
    const { fileMd5, chunkIndex, totalChunk, fileName, fileSize } = req.body;
    const chunkFile = req.file;
    if (!chunkFile || !fileMd5 || chunkIndex === undefined) {
      return res.json(global.resFormat(400, null, '参数不完整'));
    }
    const savePath = path.join(CHUNK_TMP_DIR, `${fileMd5}_${chunkIndex}`);
    await fs.move(chunkFile.path, savePath, { overwrite: true });

    const redisKey = `chunk:list:${fileMd5}`;
    await global.redisClient.sadd(redisKey, String(chunkIndex));
    await global.redisClient.expire(redisKey, CHUNK_EXPIRE_SEC);

    if (Number(chunkIndex) === 0) {
      await global.dbPool.execute(
        `INSERT IGNORE INTO upload_task_record
        (file_md5, file_name, file_size, chunk_total, task_status)
        VALUES (?,?,?,?,?)`,
        [fileMd5, fileName, fileSize, totalChunk, 'waiting_merge']
      );
    }

    return res.json(global.resFormat(200, null, `分片${chunkIndex}保存完成`));
  } catch (err) {
    return res.json(global.resFormat(500, null, err.message));
  }
}

async function checkAndMerge(req, res) {
  try {
    const { fileMd5 } = req.body;
    if (!fileMd5) return res.json(global.resFormat(400, null, '缺失MD5参数'));
    const redisKey = `chunk:list:${fileMd5}`;
    const uploadedList = await global.redisClient.smembers(redisKey);
    if (uploadedList.length === 0) {
      return res.json(global.resFormat(400, null, '暂无分片，无法执行合并'));
    }
    const totalChunk = Math.max(...uploadedList.map(Number)) + 1;

    const fullIndexSet = new Set();
    for (let i = 0; i < totalChunk; i++) fullIndexSet.add(String(i));
    const uploadedSet = new Set(uploadedList);
    const lostChunks = [...fullIndexSet].filter(i => !uploadedSet.has(i));
    if (lostChunks.length > 0) {
      return res.json(global.resFormat(400, lostChunks, `缺失分片：${lostChunks.join(',')}`));
    }

    await global.dbPool.execute(
      `UPDATE upload_task_record SET task_status = 'merging' WHERE file_md5 = ?`,
      [fileMd5]
    );

    await global.mergeQueue.add({
      fileMd5,
      totalChunk,
      startTime: Date.now()
    });

    return res.json(global.resFormat(200, null, '文件合并任务已加入后台异步队列执行'));
  } catch (err) {
    return res.json(global.resFormat(500, null, err.message));
  }
}

global.mergeQueue.process(async (job) => {
  const { fileMd5, totalChunk, startTime } = job.data;
  let maxMemory = 0;
  const memTimer = setInterval(async () => {
    const nowMem = await global.getNowMemory();
    if (nowMem > maxMemory) maxMemory = nowMem;
  }, 300);

  try {
    const finalFilePath = path.join(OUTPUT_DIR, `${fileMd5}_complete`);
    const writeStream = fs.createWriteStream(finalFilePath);
    for (let i = 0; i < totalChunk; i++) {
      const chunkPath = path.join(CHUNK_TMP_DIR, `${fileMd5}_${i}`);
      await new Promise((resolve, reject) => {
        fs.createReadStream(chunkPath)
          .pipe(writeStream, { end: false })
          .on('end', resolve)
          .on('error', reject);
      });
    }
    writeStream.end();
    clearInterval(memTimer);

    const delTasks = [];
    for (let i = 0; i < totalChunk; i++) {
      delTasks.push(fs.remove(path.join(CHUNK_TMP_DIR, `${fileMd5}_${i}`)));
    }
    await Promise.all(delTasks);
    await global.redisClient.del(`chunk:list:${fileMd5}`);
    const totalUseTimeMs = Date.now() - startTime;
    await global.dbPool.execute(
      `UPDATE upload_task_record
      SET task_status='success', use_time_ms=?, max_memory_mb=?, finish_time=NOW()
      WHERE file_md5=?`,
      [totalUseTimeMs, maxMemory, fileMd5]
    );
    return { success: true, finalPath: finalFilePath };
  } catch (error) {
    clearInterval(memTimer);
    await global.dbPool.execute(
      `UPDATE upload_task_record SET task_status='fail', finish_time=NOW() WHERE file_md5=?`,
      [fileMd5]
    );
    throw error;
  }
});

module.exports = {
  upload: require('express-fileupload')({
    useTempFiles: true,
    limits: { fileSize: 3 * 1024 * 1024 }
  }),
  chunkUpload,
  checkAndMerge,
  getUploadedChunk
};