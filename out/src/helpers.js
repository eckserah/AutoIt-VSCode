'use strict'
var {
    workspace
} = require('vscode');
var path = require('path')
var fs = require('fs')
const DEFAULT_UDFS = ['APIComConstants', 'APIConstants', 'APIDiagConstants', 
    'APIDlgConstants', 'APIErrorsConstants', 'APIFilesConstants', 'APIGdiConstants', 
    'APILocaleConstants', 'APIMiscConstants', 'APIProcConstants', 'APIRegConstants', 
    'APIResConstants', 'APIShellExConstants', 'APIShPathConstants', 'APISysConstants',
    'APIThemeConstants', 'Array', 'AutoItConstants', 'AVIConstants', 'BorderConstants',
    'ButtonConstants', 'Clipboard', 'Color', 'ColorConstants', 'ComboConstants', 
    'Constants', 'Crypt', 'Date', 'DateTimeConstants', 'Debug', 'DirConstants', 
    'EditConstants', 'EventLog', 'Excel', 'ExcelConstants', 'File', 'FileConstants', 
    'FontConstants', 'FrameConstants', 'FTPEx', 'GDIPlus', 'GDIPlusConstants', 'GuiAVI',
    'GuiButton', 'GuiComboBox', 'GuiComboBoxEx', 'GUIConstants', 'GUIConstantsEx', 
    'GuiDateTimePicker', 'GuiEdit', 'GuiHeader', 'GuiImageList', 'GuiIPAddress', 
    'GuiListBox', 'GuiListView', 'GuiMenu', 'GuiMonthCal', 'GuiReBar', 'GuiRichEdit',
    'GuiScrollBars', 'GuiSlider', 'GuiStatusBar', 'GuiTab', 'GuiToolbar', 'GuiToolTip',
    'GuiTreeView', 'HeaderConstants', 'IE', 'ImageListConstants', 'Inet', 'InetConstants',
    'IPAddressConstants', 'ListBoxConstants', 'ListViewConstants', 'Math', 'MathConstants',
    'Memory', 'MemoryConstants', 'MenuConstants', 'Misc', 'MsgBoxConstants', 'NamedPipes',
    'NetShare', 'NTSTATUSConstants', 'Process', 'ProcessConstants', 'ProgressConstants', 
    'RebarConstants', 'RichEditConstants', 'ScreenCapture', 'ScrollBarConstants', 
    'ScrollBarsConstants', 'Security', 'SecurityConstants', 'SendMessage', 
    'SliderConstants', 'Sound', 'SQLite', 'SQLite.dll', 'StaticConstants', 
    'StatusBarConstants', 'String', 'StringConstants', 'StructureConstants', 'TabConstants', 
    'Timers', 'ToolbarConstants', 'ToolTipConstants', 'TrayConstants', 'TreeViewConstants', 
    'UDFGlobalID', 'UpDownConstants', 'Visa', 'WinAPI', 'WinAPICom', 'WinAPIConstants',
    'WinAPIDiag', 'WinAPIDlg', 'WinAPIError', 'WinAPIEx', 'WinAPIFiles', 'WinAPIGdi', 
    'WinAPIInternals', 'WinAPIlangConstants', 'WinAPILocale', 'WinAPIMisc', 'WinAPIProc', 
    'WinAPIReg', 'WinAPIRes', 'WinAPIShellEx', 'WinAPIShPath', 'WinAPISys', 'WinAPIsysinfoConstants', 
    'WinAPITheme', 'WinAPIvkeysConstants', 'WindowsConstants', 'WinNet', 'Word', 'WordConstants']
var currentIncludeFiles = []
var includes = {}

module.exports = {
    getCallInfo(doc, pos) {
        // Acquire the text up the point where the current cursor/paren/comma is at
        let codeAtPosition = doc.lineAt(pos.line).text.substring(0, pos.character)
        let cleanCode = this.getParsableCode(codeAtPosition)
        
        return {
            func: this.getCurrentFunction(cleanCode),
            commas: this.countCommas(cleanCode)
        }
    },

    getParsableCode(code) {
        // Remove whole inner functions from the string for easier parsing
        code = code.replace(/\w+\([^()]*\)/g, '')
            .replace(/"[^"]*"/g, '').replace(/'[^']*'/g,'') // Remove double/single quote sets
            .replace(/"[^"]*(?=$)/g, '') // Remove double quote and text at end of line
            .replace(/'[^']*(?=$)/g, '') // Remove single quote and text at end of line
            .replace(/\([^()]*\)/g, '') // Remove paren sets
            .replace(/\({2,}/g, '(') // Reduce multiple open parens

        return code
    },

    getCurrentFunction(code) {
        let parenSplit = code.split('(')
        // Get the 2nd to last item (right in front of last open paren)
        // and clean up the results
        return parenSplit[parenSplit.length - 2].match(/(.*)\b(\w+)/)[2]
    },

    countCommas(code) {
        // Find the position of the closest/last open paren
        let openParen = code.lastIndexOf('(')
        // Count non-string commas in text following open paren
        let commas = code.slice(openParen).match(/(?!\B["'][^"']*),(?![^"']*['"]\B)/g)
        if (commas === null) {
            commas = 0
        } else {
            commas = commas.length
        }

        return commas
    },

    getIncludes(doc, isCompletionInfo = false) { // determines whether includes should be re-parsed or not.
        var text = doc.getText()
        var pattern = null
        const LIBRARY_INCLUDE_PATTERN = /^#include\s+<([\w.]+\.au3)>/gm
        var includesCheck = []

        includesCheck = this.collectRecursiveIncludes(doc,text,includesCheck)

        if (!this.arraysMatch(includesCheck, currentIncludeFiles)) {
            includes = {}
            for (var i in includesCheck) {
                var newIncludes = this.getIncludeData(includesCheck[i], isCompletionInfo)
                Object.assign(includes, newIncludes)
            }
            currentIncludeFiles = includesCheck
        }

        includesCheck = []
        while(pattern = LIBRARY_INCLUDE_PATTERN.exec(text)) {
            let filename = pattern[1].replace('.au3', '')
            if (DEFAULT_UDFS.indexOf(filename) == -1) {
                let fullPath = this.findFilepath(pattern[1])
                if (fullPath) {
                    let newData = this.getIncludeData(fullPath, isCompletionInfo)
                    Object.assign(includes, newData)
                }
            }
        }

        return includes
    },

    getIncludeData(fileName, isCompletionInfo = false) {
        // console.log(fileName)
        const _includeFuncPattern = /(?=\S)(?!;~\s)Func\s+((\w+)\((.+)\))/g
        var functions = {};
        if (isCompletionInfo)
            functions = [];
        var pattern = null;
        var fileData = this.getIncludeText(fileName);
        
        while ((pattern = _includeFuncPattern.exec(fileData)) !== null) {
            if (isCompletionInfo) {
                functions.push(pattern[1]);
                if (!Object.keys(global.hovers).find(key => key.toLowerCase() === pattern[2].toLowerCase())) {
                    global.hovers[pattern[2]] = [`Function from ${fileName}`, pattern[1]];                    
                }
            } else {
                functions[pattern[2]] = { 
                    label: pattern[1],
                    documentation: `Function from ${fileName}`,
                    params: this.getParams(pattern[3]) 
                }
                if (!Object.keys(global.hovers).find(key => key.toLowerCase() === pattern[1])) {
                    global.hovers[pattern[2]] = [`Function from ${fileName}`, pattern[1]];                    
                }
            }
        }

        return functions
    },

    getLocalSigs(doc) {
        const _includeFuncPattern = /(?=\S)(?!;~\s)^Func\s+((\w+)\((.+)\))/gm
        let text = doc.getText()
        let functions = {}
        
        let pattern = null
        while ((pattern = _includeFuncPattern.exec(text)) !== null) {
            functions[pattern[2]] = {
                label: pattern[1],
                documentation: 'Local Function',
                params: this.getParams(pattern[3])
            }
        }

        return functions
    },

    getParams(paramText) {
        var params = paramText.split(",")

        for (var p in params) {
            params[p] = { 
                label: params[p].trim(),
                documentation: ''
            }
        }    

        return params
    },


    arraysMatch(arr1, arr2) {
        if (arr1.length == arr2.length &&
            arr1.some((v) => arr2.indexOf(v) <= 0)) {
            return true
        } else {
            return false
        }
    },

    findFilepath(file) {
        let includePaths = workspace.getConfiguration('autoit').includePaths

        for (const iPath of includePaths) {
            let newPath = path.normalize(iPath + "\\") + file

            if (fs.existsSync(newPath)) {
                return newPath
            }
        }

        return 0
    },

    collectRecursiveIncludes(doc, text, includesCheck, currentPath = "") {
        // collect the includes of the document
        const _includePattern = /^\s+#include\s"(.+)"/gm
        var pattern = null
        if (currentPath == "") {
            currentPath = path.normalize(path.dirname(doc.fileName) + "\\")
        }
        while (pattern = _includePattern.exec(text)) {
            var includeName = pattern[1];
            var filePath = this.getFilePath(includeName, currentPath);
            console.log("filepath: " + filePath);
            if (includeName.indexOf('\/') != -1)
                includeName = includeName.substr(includeName.lastIndexOf('\/')+1)
            var fullFilePath = filePath + includeName;
            if (includesCheck.indexOf(fullFilePath) == -1) {
                console.log("fullfilepath: " + fullFilePath)
                includesCheck.push(fullFilePath)
                var dataFromInclude = this.getIncludeText(fullFilePath);
                var recursedIncludes = this.collectRecursiveIncludes(doc,dataFromInclude, includesCheck, filePath);
                includesCheck.concat(recursedIncludes);
            }
        }

        return includesCheck;
    },

    getIncludeText(fileName) {
        console.log(fileName)    
        return fs.readFileSync(fileName).toString();
    },

    getFilePath(fileName, currentPath) {
        var filePath = ""

        if (fileName.charAt(1) == ':') {
            filePath = fileName
        } else {
            filePath = path.normalize(currentPath + 
            ((fileName.charAt(0) == '\\' || fileName.charAt(0) == '\/') ? '' : '\\')
            + fileName)
            filePath = path.normalize(path.dirname(filePath) + ((fileName.charAt(0) == '\\' || fileName.charAt(0) == '\/') ? '' : '\\'))
        }
        filePath = filePath.charAt(0).toUpperCase() + filePath.slice(1);
        return filePath;
    }
}