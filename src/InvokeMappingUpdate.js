const AWS = require('aws-sdk');
let ConfigProvider = require('../config');
let configProvider = new ConfigProvider();
const lambda = new AWS.Lambda();

module.exports.handler = async (event) => {
    console.log('InvokeMappingUpdate: Invoking mapping fetchers');
    let cfg = await configProvider.getConfig();

    let promises = cfg.presets
        .filter(x => event.preset === undefined || event.preset === x.name )
        .map(preset => { 
            return invokeMappingFetcher(preset.name) 
        });

    await Promise.all(promises);

    return { message: 'all done' }
}

/**
 * Invoke Lambda-functions that fetch and produce mapping files
 * @param {*} preset 
 */
const invokeMappingFetcher = async (parameters) => {
    console.log('InvokeMappingUpdate: Invoking fetcher', process.env.F_UPDATE_MAPPING, parameters);
    const params = {
        FunctionName: process.env.F_UPDATE_MAPPING,
        InvocationType: "RequestResponse",
        LogType: 'Tail',
        Payload: JSON.stringify(parameters)
      };
  
      return lambda.invoke(params).promise();
};