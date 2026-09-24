import { PluginSDK } from '@logitech/plugin-sdk';
import { createActions } from './src/actions';
import { MeetBridge } from './src/bridge';

const pluginSDK = new PluginSDK();
const bridge = new MeetBridge();

// Register plugin actions
for (const action of createActions(bridge)) {
  pluginSDK.registerAction(action);
}

await pluginSDK.connect();
