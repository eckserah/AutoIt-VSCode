'use strict'

var { languages, CompletionItem, CompletionItemKind, window, workspace } = require('vscode')
var fs = require('fs')
var path = require('path')
var completions = []
var newComp
var currentIncludeFiles = []
var includes = []

var files = fs.readdirSync(__dirname + '/completions')
for (var i in files) {
    newComp = require('./completions/' + files[i])
    completions = completions.concat(newComp)
}

const _funcPattern = /Func\s+(\w*)\s*\(/g;
const _varPattern = /\$(\w*)/g;
const _includePattern = /^\s+#include\s"(.+)"/gm
const LIBRARY_INCLUDE_PATTERN = /^#include\s+<([\w.]+\.au3)>/gm
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

module.exports = languages.registerCompletionItemProvider({ language: 'autoit', scheme: 'file' }, {
    provideCompletionItems(document, position, token) {
        // Gather the functions created by the user
        var added = {};
        var result = [];
        var text = document.getText();
        var range = document.getWordRangeAtPosition(position);
        var prefix = range ? document.getText(range) : '';
        var includesCheck = []
        var libraryIncludes = []

        if (!range) {
            range = new Range(position, position);
        }

        var createNewCompletionItem = function (kind, name, strDetail = 'Document Function') {
            var compItem = new CompletionItem(name, kind);
            if (kind == CompletionItemKind.Variable) {
                strDetail = 'Variable';
            }
            compItem.detail = strDetail;

            return compItem;
        };

        if (prefix[0] === '$') {
            var pattern = null;
            while (pattern = _varPattern.exec(text)) {
                var varName = pattern[0];
                if (!added[varName]) {
                    added[varName] = true;
                    result.push(createNewCompletionItem(CompletionItemKind.Variable, varName));
                }
            }
        }

        includesCheck = collectRecursiveIncludes(document, text, includesCheck);        

        // Redo the include collecting if the includes are different
        if (!arraysMatch(includesCheck, currentIncludeFiles)) {
            includes = []
            var includeFunctions = []
            for (var i in includesCheck) {
                includeFunctions = getIncludeData(includesCheck[i])
                if (includeFunctions) {
                    for (var newFunc in includeFunctions) {
                        includes.push(createNewCompletionItem(CompletionItemKind.Function, includeFunctions[newFunc], 'Function from ' + includesCheck[i]))
                    }
                }        
            }
            currentIncludeFiles = includesCheck
        }

        // Collect the library includes
        while (pattern = LIBRARY_INCLUDE_PATTERN.exec(text)) {
            // Filter out the default UDFs 
            let filename = pattern[1].replace('.au3', '')
            if (DEFAULT_UDFS.indexOf(filename) == -1) {
                libraryIncludes.push(pattern[1])
            }
        }

        let library = []
        for (let file of libraryIncludes) {
            let fullPath = findFilepath(file)
            if (fullPath) {
                let libraryResults = getIncludeData(fullPath)
                if (libraryResults) {
                    for (var newFunc in libraryResults) {
                        library.push(createNewCompletionItem(CompletionItemKind.Function, libraryResults[newFunc], 'Function from ' + file))
                    }
                }
            }
        }
        
        result = result.concat(includes, library) //Add either the existing include functions or the new ones to result

        return completions.concat(result);
    }
}, '.', '$')

function getIncludeData(fileName) {
    // console.log(fileName)
    const _includeFuncPattern = /^(?=\S)(?!;~\s)Func\s+(\w+)\s*\(/gm
    var functions = []
    var fileText = getIncludeText(fileName);

    var pattern = null

    while(pattern = _includeFuncPattern.exec(fileText)) {
            functions.push(pattern[1])
    }

    //console.log(funcLines)
    return functions
}

function findFilepath(file) {
    let includePaths = workspace.getConfiguration('autoit').includePaths

    for (const iPath of includePaths) {
        let newPath = path.normalize(iPath + "\\") + file

        if (fs.existsSync(newPath)) {
            return newPath
        }
    }

    return 0
}

function arraysMatch(arr1, arr2) {
    if (arr1.length == arr2.length &&
        arr1.some((v) => arr2.indexOf(v) <= 0)) {
        return true
    } else {
        return false
    }
}

function collectRecursiveIncludes(doc, text, includesCheck, currentPath = "") {
    // collect the includes of the document
    const _includePattern = /^\s+#include\s"(.+)"/gm
    var pattern = null
    if (currentPath == "") {
        currentPath = path.normalize(path.dirname(doc.fileName) + "\\")
    }
    while (pattern = _includePattern.exec(text)) {
        var includeName = pattern[1];
        var filePath = getFilePath(includeName, currentPath);
        console.log("filepath: " + filePath);
        if (includeName.indexOf('\/') != -1)
            includeName = includeName.substr(includeName.lastIndexOf('\/')+1)
        var fullFilePath = filePath + includeName;
        if (includesCheck.indexOf(fullFilePath) == -1) {
            console.log("fullfilepath: " + fullFilePath)
            includesCheck.push(fullFilePath)
            var dataFromInclude = getIncludeText(fullFilePath);
            var recursedIncludes = collectRecursiveIncludes(doc,dataFromInclude, includesCheck, filePath);
            includesCheck.concat(recursedIncludes);
        }
    }

    return includesCheck;
}

function getIncludeText(fileName) {
    console.log(fileName)    
    return fs.readFileSync(fileName).toString();
}

function getFilePath(fileName, currentPath) {
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