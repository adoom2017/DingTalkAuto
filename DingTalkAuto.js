
// DingTalk package id
const PACKAGE_ID_DINGTALK = "com.alibaba.android.rimet"
           
// Wechat package id
const PACKAGE_ID_WECHAT = "com.tencent.mm"

// Notification white list
const PACKAGE_ID_WHITE_LIST = [PACKAGE_ID_DINGTALK, PACKAGE_ID_WECHAT]

const SIGNUP_ACTIVITY = "com.alibaba.android.user.login.global.SignUpWithPwdGlobalActivity"

// need accessibility service
auto.waitFor("normal")

// autox.js version should high then 4.1.0
requiresAutojsVersion("4.1.0")

// Read config from file, where can change file path, if no file found will throw exception
var path = "/sdcard/脚本/config/DingTalkAuto.json"
var config = null
if (files.exists(path)) {
    config = JSON.parse(files.read(path))
}
else {
    toastLog("No config file found.")
    throw new Error("No config")
}

// log file path
var globalLogFilePath = "/sdcard/脚本/logs/" + getCurrentDate() + ".log"

// create global log file
console.setGlobalLogConfig({
    file: globalLogFilePath
})

// notification monitor
events.observeNotification()    
events.on("notification", function(n) {
    notificationHandler(n)
})

toastLog("Auto clock begin, please find any infomation in the log")

function notificationHandler(n) {
    
    var packageId = n.getPackageName()
    var message = n.getText()
    
    if (!filterNotification(packageId, message)) {
        return
    }

    console.verbose("Receive message: " + message + " from " + packageId)
    
    // receive message from wechat which inclue "打卡", then do auto clock
    if (packageId == PACKAGE_ID_WECHAT) {

        if (message.indexOf("打卡")>=0) {
            threads.shutDownAll()
            threads.start(function(){
                doClock(message)
            })
            return
        }
        else if (message.indexOf("PushDeer")>=0) {
            threads.shutDownAll()
            threads.start(function(){
                sendPushDeer("Push Test", "This is a test message.")
            })
            return
        }
        else if (message.indexOf("Telegram")>=0) {
            threads.shutDownAll()
            threads.start(function(){
                sendTelegram("This is a test message.")
            })
            return
        }
        
    }
    
    // messge from dingtalk, push clock result
    else if (packageId == PACKAGE_ID_DINGTALK && message.indexOf("考勤打卡")>=0) { 
        threads.shutDownAll()
        threads.start(function() {
            switch(config.PushInfo.PushMethod) {
                case "PushDeer":
                    sendPushDeer("考勤结果", message)
                    break
                case "Telegram":
                    sendTelegram(message)
                    break
            }
        })
        return
    }
}

/**
 * @description clocking progress
 */
function doClock(message) {
    console.log("Begin to clock: " + getCurrentDate() + " " + getCurrentTime())

    // wakeup
    brightScreen()
    // unlock
    unlockScreen()
    // auto login
    signIn()
    // bring up dingtalk clock page
    attendClockPage()
    
    if (message.indexOf("上班打卡")>=0) 
        clockIn()
    else 
        clockOut()
    
    // lock screen for battery save
    lockScreen()
}

/**
 * @description Push message use PushDeer
 * @param {string} title title
 * @param {string} message message
 */
 function sendPushDeer(title, message) {
    url = "https://api2.pushdeer.com/message/push"

    resp = http.post(encodeURI(url), {
        "pushkey": config.PushInfo.PushDeerToken,
        "text": title,
        "desp": message,
        "type": "markdown"
    })

    console.log("push message: " + message + " use pushdeer, response: " + resp.body.string())

    sleep(1000)
    lockScreen()
}

/**
 * @description Push message use Telegram
 * @param {string} message message
 */
 function sendTelegram(message) {
    url = "https://api.telegram.org/bot" + config.PushInfo.TelegramBotToken + "/sendMessage"

    resp = http.post(encodeURI(url), {
        "chat_id": config.PushInfo.TelegramChatID,
        "text": message
    });

    console.log("push message: " + message + " use telegram, response: " + resp.body.string())
    sleep(1000)
    lockScreen()
}

/**
 * @description wakeup device
 */
function brightScreen() {

    console.log("wakeup device")
    
    // brightness mode manual
    device.setBrightnessMode(0)
    device.setBrightness(config.ScreenBrightness)
    device.wakeUpIfNeeded()
    device.keepScreenOn()
    sleep(1000)
    
    if (!device.isScreenOn()) {
        console.warn("Failed to wakeup device, retry")
        device.wakeUpIfNeeded()
        brightScreen()
    }
    else {
        console.info("Device has been wakeup")
    }
}

/**
 * @description lock screen
 * Rely on the shortcut of the lock screen on the android phone, the name is adjusted as needed
 */
 function lockScreen(){

    console.log("Begin to lock screen")

    // use gesture swap up, back to main screen
    gesture(
        320,
        [
            device.width  * 0.5,
            device.height * 0.99
        ],
        [
            device.width * 0.5,
            device.height * 0.6
        ]
    )
    sleep(2000)

    text("锁屏").waitFor()  // find the shortcut
    click("锁屏")           // click the shortcut

    // brightness mode auto
    device.setBrightnessMode(1)
    device.cancelKeepingAwake()

    sleep(1000)
    
    if (isDeviceLocked()) {
        console.info("Succeed to lock screen")
    }
    else {
        console.error("Failed to lock screen")
    }
}

/**
 * @description unlock screen
 */
function unlockScreen() {

    console.log("Begin to unlock screen")
    
    if (isDeviceLocked()) {

        gesture(
            320,
            [
                device.width  * 0.5,
                device.height * 0.9
            ],
            [
                device.width * 0.5,
                device.height * 0.1
            ]
        )

        sleep(1000)
    }

    if (isDeviceLocked()) {
        console.error("Failed to unlock screen")
        return;
    }
    console.info("Succeed to unlock screen")
}

/**
 * @description start and login dingtalk
 */
function signIn() {
    app.launchPackage(PACKAGE_ID_DINGTALK)
    console.log("Starting" + app.getAppName(PACKAGE_ID_DINGTALK) + "...")

    // mute device
    setVolume(0)
    // waiting dingtalk start
    sleep(10000)

    if (currentPackage() == PACKAGE_ID_DINGTALK &&
        currentActivity() == SIGNUP_ACTIVITY) {                             
        console.info("Account is not login")
        
        var account = id("et_phone_input").findOne()
        account.setText(config.DDInfo.DDAccount)
        console.log("input account")

        var password = id("et_pwd_login").findOne()
        password.setText(config.DDInfo.DDPassword)
        console.log("input password")
        
        var btn_login = id("btn_next").findOne()
        btn_login.click()
        console.log("login...")

        sleep(3000)
    }

    if (currentPackage() == PACKAGE_ID_DINGTALK &&
        currentActivity() != SIGNUP_ACTIVITY) {
        console.info("Account is login")
    }
}

/**
 * @description use URL Scheme to bring up clock page
 */
function attendClockPage(){

    var url_scheme = "dingtalk://dingtalkclient/page/link?url=https://attend.dingtalk.com/attend/index.html"

    if(config.DDInfo.CorporationId != "") {
        url_scheme = url_scheme + "?corpId=" + config.DDInfo.CorporationId
    }

    var a = app.intent({
        action: "VIEW",
        data: url_scheme,
        //flags: [Intent.FLAG_ACTIVITY_NEW_TASK]
    });
    app.startActivity(a);
    console.log("Bringing up clock page...")
    
    textContains("打卡").waitFor()
    console.info("Succeed to bring up clock page.")
    sleep(10000)
}


/**
 * @description Clock in 
 */
function clockIn() {

    console.log("Clock in...")

    if (null != textContains("已打卡").findOne(1000)) {
        console.info("Already clock in")
        home()
        sleep(1000)
        return;
    }

    if (null != textMatches("上班打卡").clickable(true).findOne(1000)) {
        btn_clockin = textMatches("上班打卡").clickable(true).findOnce()
        btn_clockin.click()
        console.log("Press clock in button")
    }
    else {
        click(device.width / 2, device.height * 0.560)
        console.log("Press clock in button use position")
    }

    sleep(10000)
    home()
    sleep(1000)
}


/**
 * @description Clock out 
 */
function clockOut() {

    console.log("Begin to clock out...")

    if (null != textMatches("下班打卡").clickable(true).findOne(1000)) {
        btn_clockout = textMatches("下班打卡").clickable(true).findOnce()
        btn_clockout.click()
        console.log("Press clock out button")
    }
    else if (null != textContains("早退打卡").clickable(true).findOne(1000)) {
        className("android.widget.Button").text("早退打卡").clickable(true).findOnce().parent().click()
        console.warn("Check out earlier")
    }
    else {
        click(device.width / 2, device.height * 0.560)
        console.log("Press clock out button use position")
    }
    
    sleep(10000)
    home()
    sleep(1000)
}

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

// notification filter
function filterNotification(bundleId, text) {
    return PACKAGE_ID_WHITE_LIST.some(function(item) {return bundleId == item}) 
}

function isDeviceLocked() {
    importClass(android.app.KeyguardManager)
    importClass(android.content.Context)
    var km = context.getSystemService(Context.KEYGUARD_SERVICE)
    return km.isKeyguardLocked()
}

function setVolume(volume) {
    device.setMusicVolume(volume)
    device.setNotificationVolume(volume)
    console.verbose("media volume:" + device.getMusicVolume())
    console.verbose("notificaiton volume:" + device.getNotificationVolume())
}
