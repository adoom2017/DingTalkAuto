const ACCOUNT = "钉钉账号"
const PASSWORD = "钉钉密码"

const PUSH_DEER =  "PushDeer发送密钥"
const TELEGRAM_BOT_TOKEN = "BOT_TOKEN"
const TELEGRAM_CHAT_ID = "CHAT_ID"

const PUSH_METHOD = {Telegram: 1, PushDeer: 2}
const DEFAULT_PUSH_METHOD = PUSH_METHOD.PushDeer

const PACKAGE_ID_DD = "com.alibaba.android.rimet"           // 钉钉
const PACKAGE_ID_WECHAT = "com.tencent.mm"                  // wechat

// 执行时的屏幕亮度（0-255）, 需要"修改系统设置"权限
const SCREEN_BRIGHTNESS = 20    

// 是否过滤通知
const NOTIFICATIONS_FILTER = true

// PackageId白名单
const PACKAGE_ID_WHITE_LIST = [PACKAGE_ID_DD,PACKAGE_ID_WECHAT]

// 公司的钉钉CorpId, 获取方法见 2020-09-24 更新日志。如果只加入了一家公司, 可以不填
const CORP_ID = "" 

// 监听音量+键, 开启后无法通过音量+键调整音量, 按下音量+键：结束所有子线程
const OBSERVE_VOLUME_KEY = true

// =================== ↓↓↓ 主线程：监听通知 ↓↓↓ ====================

// 读取配置文件
var path = "/sdcard/脚本/config/DingDingAuto.json"
if (files.exists(path)) {
    var config = files.read(path)
}

// 运行日志路径
var globalLogFilePath = "/sdcard/脚本/logs/" + getCurrentDate() + "-log.txt"

// 检查无障碍权限
auto.waitFor("normal")

// 检查Autojs版本
requiresAutojsVersion("4.1.0")

// 创建运行日志
console.setGlobalLogConfig({
    file: globalLogFilePath
});

// 监听本机通知
events.observeNotification()    
events.on("notification", function(n) {
    notificationHandler(n)
});

events.setKeyInterceptionEnabled("volume_up", OBSERVE_VOLUME_KEY)

if (OBSERVE_VOLUME_KEY) {
    events.observeKey()
};
    
// 监听音量+键
events.onKeyDown("volume_up", function(event){
    threads.shutDownAll()
    device.setBrightnessMode(1)
    device.cancelKeepingAwake()
    toast("已中断所有子线程!")

    // 可以在此调试各个方法
    // doClock()
    // sendPushDeer(测试主题, 测试文本)
});

toastLog("监听中, 请在日志中查看记录的通知及其内容")

// =================== ↑↑↑ 主线程：监听通知 ↑↑↑ =====================

/**
 * @description 处理通知
 */
function notificationHandler(n) {
    
    var packageId = n.getPackageName()  // 获取通知包名
    var text = n.getText()              // 获取通知文本
    
    // 过滤 PackageId 白名单之外的应用所发出的通知
    if (!filterNotification(packageId, text)) {
        return;
    }

    console.log("从" + packageId + "接收到消息：" + text)
    
    // 接收微信的打卡信息，然后做对应处理
    if (packageId == PACKAGE_ID_WECHAT && text.indexOf("打卡") >= 0) {
        threads.shutDownAll()
        threads.start(function(){
            doClock()
        })
    }
    
    // 监听钉钉返回的考勤结果
    if (packageId == PACKAGE_ID_DD && text.indexOf("考勤打卡") >= 0) { 
        threads.shutDownAll()
        threads.start(function() {
            switch(DEFAULT_MESSAGE_DELIVER) {
                case PUSH_METHOD.PushDeer:
                    sendPushDeer("考勤结果", text)
                    break;
                case PUSH_METHOD.Telegram:
                    sendTelegram("考勤结果", text)
                    break;
            }
        })
        return;
    }
}

/**
 * @description 打卡流程
 */
function doClock() {

    currentDate = new Date()
    console.log("本地时间: " + getCurrentDate() + " " + getCurrentTime())
    console.log("开始打卡流程!")

    brightScreen()      // 唤醒屏幕
    unlockScreen()      // 解锁屏幕
    signIn()            // 自动登录
    handleLate()        // 处理迟到
    attendKaoqin()      // 考勤打卡

    if (currentDate.getHours() <= 12) 
        clockIn()           
    else 
        clockOut()          
    
    lockScreen()
}

/**
 * @description PushDeer推送
 * @param {string} title 标题
 * @param {string} message 消息
 */
 function sendPushDeer(title, message) {

    console.log("向 PushDeer 发起推送请求")

    url = "https://api2.pushdeer.com/message/push"

    res = http.post(encodeURI(url), {
        "pushkey": PUSH_DEER,
        "text": title,
        "desp": message,
        "type": "markdown"
    });

    console.log(res)
    sleep(1000)
    lockScreen()    // 关闭屏幕
}

/**
 * @description Telegram推送
 * @param {string} title 标题
 * @param {string} message 消息
 */
 function sendTelegram(title, message) {

    console.log("向 Telegram 发起推送请求")

    url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage"

    res = http.post(encodeURI(url), {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message
    });

    console.log(res)
    sleep(1000)
    lockScreen()    // 关闭屏幕
}

/**
 * @description 唤醒设备
 */
function brightScreen() {

    console.log("唤醒设备")
    
    device.setBrightnessMode(0) // 手动亮度模式
    device.setBrightness(SCREEN_BRIGHTNESS)
    device.wakeUpIfNeeded() // 唤醒设备
    device.keepScreenOn()   // 保持亮屏
    sleep(1000) // 等待屏幕亮起
    
    if (!device.isScreenOn()) {
        console.warn("设备未唤醒, 重试")
        device.wakeUpIfNeeded()
        brightScreen()
    }
    else {
        console.info("设备已唤醒")
    }
    sleep(1000)
}

/**
 * @description 锁屏
 * 依赖android手机上一键锁屏的快捷方式，名字根据需要调整
 */
 function lockScreen(){

    console.log("关闭屏幕")

    //上滑到主屏幕
    gesture(
        320, // 滑动时间：毫秒
        [
            device.width  * 0.5,    // 滑动起点 x 坐标：屏幕宽度的一半
            device.height * 0.99    // 滑动起点 y 坐标：屏幕底部
        ],
        [
            device.width * 0.5,     // 滑动终点 x 坐标：屏幕宽度的一半
            device.height * 0.6     // 滑动终点 y 坐标：距离屏幕顶部 40% 的位置
        ]
    )

    sleep(2000)
    // 找到锁屏快捷键
    text("锁屏").waitFor()

    // 点击锁屏快捷键
    click("锁屏")
    sleep(1000)

    device.setBrightnessMode(1)     // 自动亮度模式
    device.cancelKeepingAwake()     // 取消设备常亮
    
    if (isDeviceLocked()) {
        console.info("屏幕已关闭")
    }
    else {
        console.error("屏幕未关闭, 请尝试其他锁屏方案, 或等待屏幕自动关闭")
    }
}

/**
 * @description 解锁屏幕
 */
function unlockScreen() {

    console.log("解锁屏幕")
    
    if (isDeviceLocked()) {

        gesture(
            320, // 滑动时间：毫秒
            [
                device.width  * 0.5,    // 滑动起点 x 坐标：屏幕宽度的一半
                device.height * 0.9     // 滑动起点 y 坐标：距离屏幕底部 10% 的位置, 华为系统需要往上一些
            ],
            [
                device.width / 2,       // 滑动终点 x 坐标：屏幕宽度的一半
                device.height * 0.1     // 滑动终点 y 坐标：距离屏幕顶部 10% 的位置
            ]
        )

        sleep(1000) // 等待解锁动画完成
        home()
        sleep(1000) // 等待返回动画完成
    }

    if (isDeviceLocked()) {
        console.error("上滑解锁失败, 请按脚本中的注释调整 gesture(time, [x1,y1], [x2,y2]) 方法的参数!")
        return;
    }
    console.info("屏幕已解锁")
}

/**
 * @description 启动并登陆钉钉
 */
function signIn() {

    app.launchPackage(PACKAGE_ID_DD)
    console.log("正在启动" + app.getAppName(PACKAGE_ID_DD) + "...")

    setVolume(0) // 设备静音

    sleep(10000) // 等待钉钉启动

    if (currentPackage() == PACKAGE_ID_DD &&
        currentActivity() == "com.alibaba.android.user.login.SignUpWithPwdActivity") {
        console.info("账号未登录")

        var account = id("et_phone_input").findOne()
        account.setText(ACCOUNT)
        console.log("输入账号")

        var password = id("et_pwd_login").findOne()
        password.setText(PASSWORD)
        console.log("输入密码")
        
        var privacy = id("cb_privacy").findOne()
        privacy.click()
        console.log("同意隐私协议")
        
        var btn_login = id("btn_next").findOne()
        btn_login.click()
        console.log("正在登陆...")

        sleep(3000)
    }

    if (currentPackage() == PACKAGE_ID_DD &&
        currentActivity() != "com.alibaba.android.user.login.SignUpWithPwdActivity") {
        console.info("账号已登录")
        sleep(1000)
    }
}


/**
 * @description 处理迟到打卡
 */
function handleLate(){
   
    if (null != textMatches("迟到打卡").clickable(true).findOne(1000)) {
        btn_late = textMatches("迟到打卡").clickable(true).findOnce() 
        btn_late.click()
        console.warn("迟到打卡")
    }
    if (null != descMatches("迟到打卡").clickable(true).findOne(1000)) {
        btn_late = descMatches("迟到打卡").clickable(true).findOnce() 
        btn_late.click()
        console.warn("迟到打卡")
    }
}


/**
 * @description 使用 URL Scheme 进入考勤界面
 */
function attendKaoqin(){

    var url_scheme = "dingtalk://dingtalkclient/page/link?url=https://attend.dingtalk.com/attend/index.html"

    if(CORP_ID != "") {
        url_scheme = url_scheme + "?corpId=" + CORP_ID
    }

    var a = app.intent({
        action: "VIEW",
        data: url_scheme,
        //flags: [Intent.FLAG_ACTIVITY_NEW_TASK]
    });
    app.startActivity(a);
    console.log("正在进入考勤界面...")
    
    textContains("打卡").waitFor()
    console.info("已进入考勤界面")
    sleep(1000)
}


/**
 * @description 上班打卡 
 */
function clockIn() {

    console.log("上班打卡...")

    if (null != textContains("已打卡").findOne(1000)) {
        console.info("已打卡")
        toast("已打卡")
        home()
        sleep(1000)
        return;
    }

    if (null != textMatches("上班打卡").clickable(true).findOne(1000)) {
        btn_clockin = textMatches("上班打卡").clickable(true).findOnce()
        btn_clockin.click()
        console.log("按下打卡按钮")
    }
    else {
        click(device.width / 2, device.height * 0.560)
        console.log("点击打卡按钮坐标")
    }
    sleep(1000)
    handleLate() // 处理迟到打卡
    
    home()
    sleep(1000)
}


/**
 * @description 下班打卡 
 */
function clockOut() {

    console.log("下班打卡...")

    if (null != textMatches("下班打卡").clickable(true).findOne(1000)) {
        btn_clockout = textMatches("下班打卡").clickable(true).findOnce()
        btn_clockout.click()
        console.log("按下打卡按钮")
        sleep(1000)
    }
    else {
        click(device.width / 2, device.height * 0.560)
        console.log("点击打卡按钮坐标")
    }

    if (null != textContains("早退打卡").clickable(true).findOne(1000)) {
        className("android.widget.Button").text("早退打卡").clickable(true).findOnce().parent().click()
        console.warn("早退打卡")
    }
    
    home()
    sleep(1000)
}

// ===================== ↓↓↓ 功能函数 ↓↓↓ =======================

function dateDigitToString(num){
    return num < 10 ? '0' + num : num
}

function getCurrentTime(){
    var currentDate = new Date()
    var hours = dateDigitToString(currentDate.getHours())
    var minute = dateDigitToString(currentDate.getMinutes())
    var second = dateDigitToString(currentDate.getSeconds())
    var formattedTimeString = hours + ':' + minute + ':' + second
    return formattedTimeString
}

function getCurrentDate(){
    var currentDate = new Date()
    var year = dateDigitToString(currentDate.getFullYear())
    var month = dateDigitToString(currentDate.getMonth() + 1)
    var date = dateDigitToString(currentDate.getDate())
    var week = currentDate.getDay()
    var formattedDateString = year + '-' + month + '-' + date
    return formattedDateString
}

// 通知过滤器
function filterNotification(bundleId, text) {
    var check = PACKAGE_ID_WHITE_LIST.some(function(item) {return bundleId == item}) 
    if (!NOTIFICATIONS_FILTER || check) {
        return true
    }
    else {
        return false 
    }
}

// 屏幕是否为锁定状态
function isDeviceLocked() {
    importClass(android.app.KeyguardManager)
    importClass(android.content.Context)
    var km = context.getSystemService(Context.KEYGUARD_SERVICE)
    return km.isKeyguardLocked()
}

// 设置媒体和通知音量
function setVolume(volume) {
    device.setMusicVolume(volume)
    device.setNotificationVolume(volume)
    console.verbose("媒体音量:" + device.getMusicVolume())
    console.verbose("通知音量:" + device.getNotificationVolume())
}
