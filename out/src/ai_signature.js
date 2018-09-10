'use strict'

var { languages, SignatureHelp, SignatureInformation, ParameterInformation, 
    MarkdownString } = require('vscode')
var mainFunctions = require('./signatures/functions.json')
var udfs = require('./signatures/udfs.json')
var helper = require('./helpers.js');
const defaultSigs = Object.assign({}, mainFunctions, udfs, 
    require('./signatures/udf_word'),
    require('./signatures/udf_winnet'))

module.exports = languages.registerSignatureHelpProvider({ language: 'autoit', scheme: 'file' }, {
    provideSignatureHelp(document, position) {
        // Find out what called for sig
        let caller = helper.getCallInfo(document, position)
        if (caller == null) {
            return null
        }

        //Integrate user functions
        const signatures = Object.assign({}, defaultSigs, helper.getIncludes(document), 
        helper.getLocalSigs(document))
        

        //Get the called word from the json files
        let foundSig = signatures[caller.func]
        if (foundSig == null) {
            return null
        }

        let thisSignature = new SignatureInformation(foundSig.label, 
            new MarkdownString("##### " + foundSig.documentation))
            //Enter parameter information into signature information
        foundSig.params.forEach(element => {
            thisSignature.parameters.push(new ParameterInformation(element.label, 
                new MarkdownString(element.documentation)))
        })

        //Place signature information into results
        let result = new SignatureHelp()
        result.signatures = [thisSignature]
        result.activeSignature = 0
        result.activeParameter = caller.commas

        return result
    }
}, '(', ',')