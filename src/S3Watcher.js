/**
 * Watches S3 bucket and gets triggered when a new file is added
 * Depending on the file & key the relevant function is triggered
 * Expected key structure: {presetName}/{action}/{fileName.ext}, 
 * e.g. 
 *   -> farmerj/uploads/2000-CP-12345.json will trigger a ConvertToXml function
 *   -> farmerj/xml/2000-CP-12345.xml will trigger a UploadToXLedger function
 */

'use strict';
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

module.exports.handler = async (event) => {

    // Read options from the event.
    console.log("S3Watcher: Reading options from event:", event);
    let srcKey = event.Records[0].s3.object.key;
    let srcKeyComponents = srcKey.split('/');

    let params = {
        InvocationType: "RequestResponse",
        LogType: 'Tail',
        Payload: JSON.stringify({        
            presetName: srcKeyComponents[0],
            filePath: srcKey
        })
      };

    switch(srcKeyComponents[1]) {
        case 'uploads': 
            // a new order was exported and uploaded
            params.FunctionName = process.env.F_CONVERT;
            console.log('S3Watcher: Invoking XML-converter', params);
            await lambda.invoke(params).promise();
            break;
        case 'xml': 
            // a new file was converted 
            params.FunctionName = process.env.F_UPLOAD;
            console.log('S3Watcher: Invoking XLedger-uploader', params);
            await lambda.invoke(params).promise();        
            break;
    }

    return { message: 'Done' }
}