#!/bin/bash
echo "开始自动化部署分布式上传系统"
# 安装依赖
npm install
# 关闭旧进程
pkill -f "node src/app.js"
# 后台启动服务
nohup node src/app.js > server.log 2&gt;&amp;1 &amp;
echo "服务部署启动成功，端口3000"