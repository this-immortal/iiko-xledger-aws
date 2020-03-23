'use strict';
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

module.exports.handler = async (event) => {

    let presetName = event;
    console.log('ReadProductMapping: Reading menu for profile ', presetName);
    const params = {
        Bucket: process.env.CONFIG_BUCKET,
        Key: 'mapping/'+presetName+'/product_groups.json'
    }
    let mapping = null;
    mapping = await readMapping(presetName);
    return { error: mapping === null, data: mapping };

}


/**
 * Reads mapping file from S3
 * Returns null if file is not found
 * @param {*} presetName 
 */
const readMapping = async (presetName) => {
    return s3.getObject({
        Bucket: process.env.CONFIG_BUCKET,
        Key: 'mapping/'+presetName+'/product_groups.json'
    })
    .promise()
    .then((data) => {return JSON.parse(data.Body)})
    .catch(()=> {console.log('stored mapping not found'); return null});
}
