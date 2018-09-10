'use strict'


var { languages, CompletionItem, CompletionItemKind } = require('vscode');
var fs = require('fs');
var helper = require('./helpers.js');
var newComp;
var currentIncludeFiles = [];

var files = fs.readdirSync(__dirname + '/completions')
for (var i in files) {
    newComp = require('./completions/' + files[i])
    global.completions = global.completions.concat(newComp)
}

const _varPattern = /\$(\w*)/g;
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

        includesCheck = helper.collectRecursiveIncludes(document, text, includesCheck);        

        // Redo the include collecting if the includes are different
        if (!helper.arraysMatch(includesCheck, currentIncludeFiles)) {
            global.includes = []
            var includeFunctions = []
            for (var i in includesCheck) {
                includeFunctions = helper.getIncludeData(includesCheck[i], true)
                if (includeFunctions) {
                    for (var newFunc in includeFunctions) {
                        global.includes.push(createNewCompletionItem(CompletionItemKind.Function, includeFunctions[newFunc], 'Function from ' + includesCheck[i]))
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
            let fullPath = helper.findFilepath(file)
            if (fullPath) {
                let libraryResults = helper.getIncludeData(fullPath, true)
                if (libraryResults) {
                    for (var newFunc in libraryResults) {
                        library.push(createNewCompletionItem(CompletionItemKind.Function, libraryResults[newFunc], 'Function from ' + file))
                    }
                }
            }
        }
        
        result = result.concat(includes, library) //Add either the existing include functions or the new ones to result

        return global.completions.concat(result);
    }
}, '.', '$')