#!/bin/bash

# 修復後端連線問題腳本
# 解決 3031 端口被占用和登入 Failed to fetch 錯誤

echo "🔍 檢查 3031 端口占用情況..."

# 查找占用 3031 端口的進程
PID=$(lsof -ti:3031)

if [ ! -z "$PID" ]; then
    echo "📍 發現進程 $PID 占用端口 3031"
    echo "🔪 終止進程 $PID..."
    kill -9 $PID
    sleep 2
    
    # 再次檢查是否成功終止
    NEW_PID=$(lsof -ti:3031)
    if [ ! -z "$NEW_PID" ]; then
        echo "⚠️  進程仍在運行，強制終止..."
        sudo kill -9 $NEW_PID
    else
        echo "✅ 成功終止占用 3031 端口的進程"
    fi
else
    echo "✅ 端口 3031 未被占用"
fi

# 清理可能的殭屍進程
echo "🧹 清理殭屍進程..."
ps aux | grep '[Zz]ombie' | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true

# 檢查並清理可能的 node 相關進程
echo "🔍 檢查 node 相關進程..."
NODE_PIDS=$(ps aux | grep 'node.*3031\|npm.*dev' | grep -v grep | awk '{print $2}')
if [ ! -z "$NODE_PIDS" ]; then
    echo "🔪 終止相關 node 進程: $NODE_PIDS"
    echo $NODE_PIDS | xargs kill -9
fi

# 等待端口完全釋放
echo "⏳ 等待端口釋放..."
sleep 3

# 啟動後端服務器
echo "🚀 啟動後端服務器..."

# 檢查是否有 nodemon 配置
if [ -f "nodemon.json" ]; then
    echo "📦 使用 nodemon 啟動後端服務器..."
    # 在背景啟動後端服務器
    nohup npm run server:dev > backend.log 2>&1 &
    BACKEND_PID=$!
    echo "📝 後端服務器 PID: $BACKEND_PID"
else
    echo "📦 直接啟動後端服務器..."
    # 在背景啟動後端服務器
    nohup npx tsx api/server.ts > backend.log 2>&1 &
    BACKEND_PID=$!
    echo "📝 後端服務器 PID: $BACKEND_PID"
fi

# 等待服務器啟動
echo "⏳ 等待後端服務器啟動..."
sleep 8

# 檢查服務器是否成功啟動 (檢查 3030 和 3031 端口)
BACKEND_PORT=""
for port in 3030 3031 3032; do
    if lsof -ti:$port > /dev/null; then
        BACKEND_PORT=$port
        echo "✅ 後端服務器成功啟動在端口 $port"
        break
    fi
done

if [ -z "$BACKEND_PORT" ]; then
    echo "❌ 後端服務器啟動失敗，檢查日誌:"
    tail -20 backend.log
else
    echo "🌐 後端服務器可訪問: http://localhost:$BACKEND_PORT"
fi

# 測試前端到 Supabase 的連接
echo "🌐 測試 Supabase 連接..."
SUPABASE_URL=$(grep VITE_SUPABASE_URL .env.local 2>/dev/null | cut -d'=' -f2 | tr -d '"')
if [ ! -z "$SUPABASE_URL" ]; then
    echo "📡 測試連接到: $SUPABASE_URL"
    if curl -s --connect-timeout 10 "$SUPABASE_URL/rest/v1/" > /dev/null; then
        echo "✅ Supabase 連接正常"
    else
        echo "❌ Supabase 連接失敗"
    fi
else
    echo "⚠️  未找到 Supabase URL 配置"
fi

# 檢查前端開發服務器狀態
echo "🖥️  檢查前端開發服務器..."
FRONTEND_PORTS=(5173 5174 5175 5176 5177 5178)
for port in "${FRONTEND_PORTS[@]}"; do
    if lsof -ti:$port > /dev/null; then
        echo "✅ 前端服務器運行在端口 $port"
        echo "🌐 可訪問: http://localhost:$port"
        break
    fi
done

echo "🎉 修復腳本執行完成！"
echo "📋 建議步驟:"
echo "   1. 打開瀏覽器訪問前端應用"
echo "   2. 使用登入調試工具測試連接"
echo "   3. 如果仍有問題，檢查 backend.log 日誌"