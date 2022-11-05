// 读取配置文件
var path = "/sdcard/脚本/config/DingDingAuto1.json"
var config = null
if (files.exists(path)) {
    config = JSON.parse(files.read(path))
}
else {
    toastLog("No config file found.")
    throw new Error("No config")
}

console.log(config.DDAccount)
console.log(config.DDPassword)
console.log(config.PushDeerToken)