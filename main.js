/* global require __dirname */

const {app, BrowserWindow, Menu, MenuItem, Tray, dialog, ipcMain} = require('electron');

const io = require('socket.io-client');
const path = require('path');
const {exec} = require('child_process');
const config = require('electron-settings');
const fs = require('fs');
const debug = process.env.crmdebug?process.env.crmdebug:false;
const url = require('url');

let desktopPath = path.join(process.env.USERPROFILE ? process.env.USERPROFILE : '/Users/developeracc/', 'Desktop');
let tray=null;
let logMe = (log) => {
    let d = new Date();
    if (debug) {
        console.log(`${log} @ ${d.getTime()}`);
        fs.appendFile('log', `${log} @ ${d.getTime()} \r\n`, function (err) {
        });
    }
};

let mainWindow;
let lastBluredWindow=[];

let pg = fs.readFileSync(path.join(__dirname, '_frame.html'), {encoding: 'utf-8'});

let preparePageBody = (url) => {
    return 'data:text/html,' + pg.replace('xxxurl', url).replace(new RegExp('\\t', 'g'), '');
};

const isSecondInstance = app.makeSingleInstance(() => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

if (isSecondInstance) {
    app.exit(0);
}

let socket;
let trayIcon = __dirname + '/icon.png';
const trayMenu = Menu.buildFromTemplate([
    {
        label: 'Quit',
        click: function () {
            app.exit(0);
        }
    }
]);

let buildTemplate = function (window, isMainWindow) {
    let backButton = new MenuItem(
        {
            label: 'Назад',
            click: function () {
                window.webContents.executeJavaScript(`document.querySelector('#content').goBack()`);
            },
            enabled: false
        });

    let forwardButton = new MenuItem(
        {
            label: 'Вперед',
            click: function () {
                window.webContents.executeJavaScript(`document.querySelector('#content').goForward()`);
            },
            enabled: false
        });

    let homeButton = new MenuItem({
        label: 'Домой',
        click: function () {
            window.webContents.executeJavaScript(`document.querySelector('#content').loadURL('${config.get('startPageUrl')}')`);
        }
    });

    let hideButton = new MenuItem({
        label: 'Свернуть окно',
        click: function () {
            window.hide();
        }
    });
    let scanButton = new MenuItem({
        label: 'eArchive',
        click: function () {
            let scanerPath = path.join(desktopPath, 'eArchive.appref-ms');
            exec(scanerPath, (err) => {
                logMe(err);
            });
        }
    });
    let debugButton = new MenuItem({
        label: 'Debug',
        click: function () {
            mainWindow.webContents.toggleDevTools()
        }
    });
    let menuArray=[
        backButton,
        forwardButton,
        homeButton,
        scanButton
    ];
    if(debug){
        menuArray.push(debugButton);
    }
    if(isMainWindow){
        menuArray.unshift(hideButton);
    }
    let menu = Menu.buildFromTemplate(menuArray);
    return menu;
};

let createNewWindow=function(url, isMainWindow){
    let window = new BrowserWindow({
        width: config.get('window.width'),
        height: config.get('window.height')
    });
    window.setMenu(buildTemplate(window, isMainWindow));
    window.loadURL(preparePageBody(url));
    window.on('blur', function () {
        lastBluredWindow.push(window);
    });
    return window
};

app.on('ready', () => {
    if (!config.has('serverUrl')) {
        let jsonFile;
        let jsonConfig;
        try {
            jsonFile = fs.readFileSync(path.join(desktopPath, 'config.json'), {encoding: 'utf-8'});
            fs.unlinkSync((path.join(desktopPath, 'config.json')));
            jsonConfig = JSON.parse(jsonFile);
         }
        catch (e) {
            dialog.showMessageBox({
                type: 'warning',
                message: 'Не удалось загрузть файл конфигурации :( Установлены параметры по умолчанию'
            }, function () {
            
            })
        }
        jsonConfig=jsonConfig?jsonConfig:{
            "serverUrl":"https://77.244.213.6:3000",
            "startPageUrl":"https://office.shopfinance.ru",
            "window":{
                "width":800,
                "height":600
            },
            "internalPhone":"000"
        };
        config.set('serverUrl', jsonConfig.serverUrl);
        config.set('startPageUrl', jsonConfig.startPageUrl);
        config.set('window', jsonConfig.window);
        config.set('internalPhone', jsonConfig.internalPhone);
    }
    socket = io(config.get('serverUrl'));
    mainWindow = createNewWindow(config.get('startPageUrl'), true);

    tray = new Tray(trayIcon);
    tray.setContextMenu(trayMenu);
    tray.on('click', () => {
        mainWindow.show();
    });

    socket.on('msg', function (msg) {
        if(debug){
            console.log(msg);
        }
        var allWins=BrowserWindow.getAllWindows();
        var activeWindow=null;
        allWins.forEach(win=>{
            if(win.isFocused()){
                activeWindow=win;
            }
        });
        if(activeWindow){
            activeWindow.webContents.executeJavaScript(`new_webhook(${JSON.stringify(msg)})`);
        }
        else {
            try {
                let lastActiveWindow;
                if(lastBluredWindow.length>0){
                    let windowCandidate=lastBluredWindow.pop();
                    while(!windowCandidate && lastBluredWindow.length>0){
                        windowCandidate=lastBluredWindow.pop();
                    }
                    lastActiveWindow=windowCandidate?windowCandidate:mainWindow;
                    lastActiveWindow.setAlwaysOnTop(true);
                    lastActiveWindow.minimize();
                    lastActiveWindow.show();
                    lastActiveWindow.setAlwaysOnTop(false);
                    lastActiveWindow.webContents.executeJavaScript(`new_webhook(${JSON.stringify(msg)})`);
                }
            }
            catch (e) {
                if(debug){
                  logMe(e);
                }
            }
        }
    });

    socket.on('connect', () => {
        setTimeout((function () {
            if(debug) {
                logMe('Saying that we are ' + config.get('internalPhone'));
            }
            socket.emit('map', JSON.stringify({iam: config.get('internalPhone')}));
        }).bind(this), 400);

    });
    if(debug){
        socket.on('connect_error', (err)=>logMe('Connect error: '+err));
        socket.on('connect_timeout', (tm)=>logMe('Connect timeout: '+tm));
        socket.on('error', (err)=>logMe('Error: '+err));
        socket.on('disconnect', (err)=>logMe('Disconnect: '+err));
        socket.on('reconnect', (err)=>logMe('Reconnect '+err));
        socket.on('reconnect_attempt', (err)=>logMe('Reconnect attempt: '+err));
        socket.on('reconnecting', (err)=>logMe('reconnecting: '+err));
        socket.on('reconnect_error', (err)=>logMe('Reconnect error'+err));
        socket.on('reconnect_failed', ()=>logMe('Reconnect failed'));
        socket.on('ping', ()=>logMe('Ping'));
        socket.on('pong', (l)=>logMe('Pong: '+l));
    }
    mainWindow.on('close', function (e) {
        e.preventDefault();
        mainWindow.hide();
        return false;
    });
});

app.on('window-all-closed', () => {
    return false;
});

ipcMain.on('openDefaultWindow', (event, arg) => {
    createNewWindow(config.get('startPageUrl'), false);
});
ipcMain.on('openTargetWindow', (event, arg)=>{
    createNewWindow(arg, false);
});