'use strict';
let ConfigProvider = require('../config');
let configProvider = new ConfigProvider();
const axios = require("axios");

module.exports.login = async (event) => {

    console.log("Auth: Logging in", event);
    // we expect that config preset name is sent within event.preset
    const preset = await configProvider.getPreset(event.preset);

    // Authenticating in iiko
    const options = {
        headers: {'Content-Type':'application/json'},
        withCredentials: true
      }

    let cookie = null;  
    let attempts = 0;
    let response = null;
    while (cookie === null && attempts < 10) {
        console.log('Auth: Authentication attempt ' + (attempts+1));
        response = await axios.post(preset.iikoWeb.url+'/api/auth/login', { login: preset.iikoWeb.user, password: preset.iikoWeb.password }, options);
        if (response.headers["set-cookie"] !== undefined) {
            cookie = response.headers["set-cookie"][0]; // get cookie from request
        } else {
            console.log(response.headers);
        }
        attempts++;
    }

    console.log('Auth: logged in as ' + response.data.user.name);

    if (cookie === null) {
        return { error: true, message: 'Could not get session cookie '}
    }

    event.server = preset.iikoWeb.url;
    event.cookie = cookie;

    return event;
}


module.exports.logout = async (event) => {
    console.log("Auth: logging out", event);
    const preset = await configProvider.getPreset(event.preset);
    await axios.get(preset.iikoWeb.url+'/api/auth/logout', {
        headers: {'Content-Type':'application/json', Cookie: event.cookie},
        withCredentials: true
    });

    return event;
}


module.exports.selectStore = async (event) => {

    console.log("Auth: selecting store", event);
    const preset = await configProvider.getPreset(event.preset);
    // first run
    if (event.storeIds === undefined) {
        event.storeIds = preset.storeMapping.map(i => i.storeId)
    }

    event.storeId = event.storeIds.pop()
    event.storeCode = preset.storeMapping.find(s => s.storeId === event.storeId).storeCode;

    // select
    const response = await axios.get(preset.iikoWeb.url+'/api/stores/select/'+event.storeId, {
        headers: {'Content-Type':'application/json', Cookie: event.cookie},
        withCredentials: true
    });

    event.isLastStore = event.storeIds.length === 0;
    console.log("Auth: got response", response)

    if (response.data.error) {
        throw 'Auth: got error!'
    }

    console.log("Auth: selected store: " + response.data.store)

    return event;

}