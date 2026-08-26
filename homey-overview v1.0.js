// =====================================================================
//  Homey Overview  —  v1.0
//  Builds a full system overview (apps, flows, devices, Z-Wave, Zigbee,
//  logic variables, HomeyScript scripts) and emails it as HTML, with a
//  "Summary & Actions" section highlighting what changed since the last
//  run. See the README for setup instructions.
// =====================================================================

// Set any of these from `false;` to `true;` to see the corresponding Name(s) or Node ID('s) added to the list.
// (See further down for the DEFAULT_MAIL_TO and TIMEZONE settings, which you'll likely want to change.)
const showUpdateableApps = true;
const showDisabledApps = true;
const showSDKv2Apps = true;
const showSDKv3Apps = true;
const showDisabledFlows = true;
const showBrokenFlows = true;
const showDisabledAdvancedFlows = true;
const showBrokenAdvancedFlows = true;
const showZwaveDevices = true;
const showZwaveRouterDevices = true;
const showZwaveUnsecureDevices = true;
const showZwaveSecureS0Devices = true;
const showZwaveSecureS2AuthenticatedDevices = true;
const showZwaveSecureS2UnauthenticatedDevices = true;
const showZwaveBatteryDevices = true;
const showZwaveUnreachableNodes = true;
const showZwaveUnknownNodes = true;
const showZigbeeNodes = true;
const showZigbeeRouter = true;
const showZigbeeEndDevice = true;
const showVirtualDevices = true;
const showIRDevices = true;
const showOtherDevices = true;

// Email settings
// Reads the destination address(es) from the flow argument (args[0]), so this
// script can be shared/reused without hardcoding a personal email address.
// Multiple recipients can be supplied, separated by "," or ";" — one email
// is sent per recipient (rather than relying on the mail app to support a
// combined recipient list in a single field).
// Falls back to a default when run manually from the script editor (no args).
const DEFAULT_MAIL_TO = 'your.email@example.com'; // <-- CHANGE THIS to your own email address (only used when run manually without an argument)
const rawMailTo = (args && args[0] && String(args[0]).trim()) ? String(args[0]).trim() : DEFAULT_MAIL_TO;
const mailToList = rawMailTo.split(/[,;]+/).map(s => s.trim()).filter(Boolean);

// Timezone used to format the date/time shown in the email (subject + header).
// The HomeyScript sandbox's default timezone can be UTC regardless of where
// your Homey is actually located, so this is set explicitly rather than left
// to the system default. CHANGE THIS to your own IANA timezone name (e.g.
// 'America/New_York', 'Europe/London', 'Asia/Tokyo') if you're not in the
// Netherlands.
const TIMEZONE = 'Europe/Amsterdam';

// Script version, shown in the email subtitle. Bump this if you modify the
// script, so you can tell at a glance (or in a screenshot) which version
// generated a given report.
const VERSION = '1.0';

// ================= Don't edit anything below here =================
// Changes vs. earlier versions:
//  - Uses the new homey-api (v2). If your Homey Pro is on the older
//    firmware (v1 API), some fields (WiFi/Ethernet status) won't populate.
//  - Builds an HTML report in addition to the console log, and emails it
//    via the 'Email versturen' / 'Send Email' app (homey:app:email.sender:sendmail)
//  - Every section has a "back to top" link (note: Gmail often doesn't
//    support in-mail anchor navigation, other clients do)
//  - Summary section at the top with findings vs. the previous scan.
//    Comparison data (incl. name lists) is stored in a Logic variable
//    called "Overview_previous_snapshot" (JSON string) — this variable is
//    created and updated automatically, you don't need to create it yourself.
//  - Diffs show the involved item(s), in readable sentence form:
//    "<n> <label> since previous scan: a, b and c" — item names are bold.
//  - Filters "__mcp_run_*" scripts out of the HomeyScript script count:
//    these are internal leftovers from ad-hoc (unsaved) script runs via
//    an MCP bridge, not real user scripts. Harmless to leave in even if
//    you don't use MCP.
//  - WiFi/Ethernet: only the TRANSITION is reported (disconnected <-> connected),
//    not the ongoing state on every run. The System section further down
//    always shows the live current status regardless.
//  - Notification count change is intentionally not reported (too noisy).
//  - Report language: English.
//  - Destination email address(es) are passed in as a flow argument (see
//    above), not hardcoded, so the script is easy to share/reuse. Supports
//    multiple comma/semicolon-separated recipients.
//  - For apps disabled/crashed and basic/advanced flows disabled/broken,
//    a deleted item is no longer reported by the disabled/broken subset
//    check at all (it used to say "re-enabled"/"fixed" incorrectly, or
//    briefly said "deleted" there too, which double-reported it alongside
//    the population-level installed/uninstalled or created/deleted line).
//    Deletions are now reported exactly once, by the population-level diff.
//  - "Other devices" (everything that isn't Virtual/IR/Z-Wave/Zigbee, e.g.
//    WiFi, Bluetooth, Thread/Matter, cloud-app devices) gets a name list,
//    matching Virtual devices. No protocol-level health data is available
//    for these via HomeyScript.
//  - UniFi network-presence "devices" (driverId homey:app:com.ubnt.unifi:*,
//    e.g. wifi-client/cable-client) are completely EXCLUDED from all counts,
//    lists and diffs, if you have the UniFi app installed. These are
//    per-network-client shadow devices created by the UniFi app, and churn
//    constantly as clients (dis)connect — including them would flood the
//    summary with noise unrelated to actual smart-home device health.
//    Harmless to leave in if you don't have the UniFi app.
//  - Apps installed/uninstalled and basic/advanced flows created/deleted
//    now show the actual name(s) in bold in the Summary, instead of just a
//    bare "X → Y" count (which was previously the case for the totals,
//    unlike the disabled/broken subsets which already showed names).
//  - Email footer no longer references a specific schedule or flow name
//    (that text used to be hardcoded and could go stale, e.g. if you run
//    this daily instead of weekly, or renamed the triggering flow).
//  - The date/time shown in the email (subject + header) is now formatted
//    with an explicit TIMEZONE setting (see top of script, default
//    'Europe/Amsterdam'), since the HomeyScript sandbox's default timezone
//    can be UTC regardless of your Homey's actual location, which made the
//    displayed time off by a few hours.

const report = {};

// -------- Fetch previous snapshot (for comparison) --------
let previousSnapshot = null;
let snapshotVarId = null;
try {
  const varsForSnapshot = await Homey.logic.getVariables();
  const snapVar = Object.values(varsForSnapshot).find(v => v.name === 'Overview_previous_snapshot');
  if (snapVar) {
    snapshotVarId = snapVar.id;
    if (snapVar.value) {
      try { previousSnapshot = JSON.parse(snapVar.value); } catch (e) { previousSnapshot = null; }
    }
  }
} catch (e) { /* no snapshot variable found, ignore */ }

log('--------------- Homey Pro Overview (v2 API) --------------');

await Homey.system.getSystemName()
  .then(result => { log('Homey name:', result); report.homeyName = result; })
  .catch(() => log('Failed: Getting Homey Name'));

let homeyPlatformVersion;
await Homey.system.getInfo()
  .then(result => {
    log('Homey version:', result.homeyVersion);
    log('Homey model:', result.homeyModelName, '(' + result.cpus.length + ' core(s))');
    homeyPlatformVersion = result.homeyPlatformVersion || 1;

    const d = Math.floor(result.uptime / (3600*24));
    const h = Math.floor(result.uptime % (3600*24) / 3600);
    const m = Math.floor(result.uptime % 3600 / 60);
    const s = Math.floor(result.uptime % 60);

    const dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
    const hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    const mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    const sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    const uptimeText = dDisplay + hDisplay + mDisplay + sDisplay;
    log('Uptime:', result.uptime, '(' + uptimeText + ')');

    report.version = result.homeyVersion;
    report.model = result.homeyModelName;
    report.cores = result.cpus.length;
    report.uptimeText = uptimeText;

    if (homeyPlatformVersion === 2) {
      log('WiFi:', (result.wifiConnected) ? 'connected' : 'not connected');
      log('Ethernet:', (result.ethernetConnected) ? 'connected' : 'not connected');
      report.wifi = result.wifiConnected;
      report.ethernet = result.ethernetConnected;
    }
  })
  .catch(() => log('Failed: Getting Homey Stats'));

await Homey.updates.getUpdates()
  .then(result => {
    report.updateAvailable = result.length > 0 ? result[0].version : null;
    if(result.length > 0) {
      log('Update available:', result[0].version);
    } else {
      log('Update available: None');
    }
  })
  .catch(() => log('Failed: Getting Updates'));
log('\r\n------------------ Main ---------------------');

await Homey.users.getUsers()
  .then(result => {
    let owner = 0, manager = 0, user = 0, guest = 0;
    const names = [];
    Object.keys(result).forEach(function(key) {
      if (result[key].role === 'owner') owner++;
      if (result[key].role === 'manager') manager++;
      if (result[key].role === 'user') user++;
      if (result[key].role === 'guest') guest++;
      names.push(result[key].name || result[key].email || result[key].id);
    });
    report.users = { total: Object.keys(result).length, owner, manager, user, guest, names };
    log(Object.keys(result).length, 'Users', '('  + owner + ' owner, ' + manager + ' manager(s), ' + user + ' user(s), ' + guest + ' guest(s))');
  })
  .catch(() => log('Failed: Getting Users'));

await Homey.apps.getApps()
  .then(result => {
    let sdkv2 = 0, sdkv2Apps = [], sdkv3 = 0, sdkv3Apps = [], updateable = 0, updateableApps = [], disabled = 0, disabledApps = [];
    const allNames = [];

    Object.keys(result).forEach(function(key) {
      allNames.push(result[key].name);
      if (result[key].updateAvailable) {
        updateable++;
        updateableApps.push(result[key].name);
      }
      if (result[key].sdk === 2) {
        sdkv2++;
        sdkv2Apps.push(result[key].name);
      }
      if (
        result[key].sdk === 3
        || homeyPlatformVersion === 2
      ) {
        sdkv3++;
        sdkv3Apps.push(result[key].name);
      }
      if (result[key].state !== 'running' || result[key].enabled === false) {
        disabled++;
        disabledApps.push(result[key].name);
      }
    });

    report.apps = {
      total: Object.keys(result).length,
      allNames,
      sdkv2, sdkv2Apps: showSDKv2Apps ? sdkv2Apps : [],
      sdkv3, sdkv3Apps: showSDKv3Apps ? sdkv3Apps : [],
      updateable, updateableApps: showUpdateableApps ? updateableApps : [],
      disabled, disabledApps: showDisabledApps ? disabledApps : []
    };

    if (showSDKv2Apps) { log('---------------------------------------------'); log('SDKv2 apps:'); log(sdkv2Apps.join('\r\n')); log('---------------------------------------------'); }
    if (showSDKv3Apps) { log('---------------------------------------------'); log('SDKv3 apps:'); log(sdkv3Apps.join('\r\n')); log('---------------------------------------------'); }
    if (showUpdateableApps) { log('---------------------------------------------'); log('Updateable apps:'); log(updateableApps.join('\r\n')); log('---------------------------------------------'); }
    if (showDisabledApps) { log('---------------------------------------------'); log('Disabled apps:'); log(disabledApps.join('\r\n')); log('---------------------------------------------'); }

    log(Object.keys(result).length, 'Apps', '('  + sdkv2 + ' SDKv2, '  + sdkv3 + ' SDKv3, '  + updateable + ' updateable, ' + disabled + ' disabled/crashed)');
  })
  .catch(() => log('Failed: Getting Apps'));

await Homey.zones.getZones()
  .then(result => { report.zonesTotal = Object.keys(result).length; log(Object.keys(result).length, 'Zones'); })
  .catch(() => log('Failed: Getting Zones'));

await Homey.notifications.getNotifications()
  .then(result => { report.notificationsTotal = Object.keys(result).length || 0; log(Object.keys(result).length || 0, 'Notifications (Timeline)'); })
  .catch(() => log('Failed: Getting Notifications'));

await Homey.logic.getVariables()
  .then(result => {
    let boolean = 0, number = 0, string = 0;
    Object.keys(result).forEach(function(key) {
      if (result[key].type === 'boolean') boolean++;
      if (result[key].type === 'number') number++;
      if (result[key].type === 'string') string++;
    });
    report.logicVars = { total: Object.keys(result).length, boolean, number, string };
    log(Object.keys(result).length, 'Logic Variables', '(' + boolean + ' boolean (yes/no), ' + number + ' number, ' + string + ' string)');
  })
  .catch(() => log('Failed: Getting Variables'));

await Homey.flow.getFlows()
  .then(result => {
    let disabled = 0, broken = 0, disabledNames = [], brokenNames = [];
    const allNames = [];
    Object.keys(result).forEach(function(key) {
      allNames.push(result[key].name);
      if (!result[key].enabled) { disabled++; disabledNames.push(result[key].name); }
      if (result[key].broken) { broken++; brokenNames.push(result[key].name); }
    });

    report.flows = {
      total: Object.keys(result).length, broken, disabled,
      allNames,
      disabledNames: showDisabledFlows ? disabledNames : [],
      brokenNames: showBrokenFlows ? brokenNames : []
    };

    if (showDisabledFlows) { log('---------------------------------------------'); log('Disabled flow names:'); log(disabledNames.join('\r\n')); log('---------------------------------------------'); }
    if (showBrokenFlows) { log('---------------------------------------------'); log('Broken flow names:'); log(brokenNames.join('\r\n')); log('---------------------------------------------'); }

    log(Object.keys(result).length, 'Flows', '('  + broken + ' broken, ' + disabled + ' disabled)');
  })
  .catch(() => log('Failed: Getting Flows'));

await Homey.flow.getAdvancedFlows()
  .then(result => {
    let disabled = 0, broken = 0, disabledNames = [], brokenNames = [];
    const allNames = [];
    Object.keys(result).forEach(function(key) {
      allNames.push(result[key].name);
      if (!result[key].enabled) { disabled++; disabledNames.push(result[key].name); }
      if (result[key].broken) { broken++; brokenNames.push(result[key].name); }
    });

    report.advancedFlows = {
      total: Object.keys(result).length, broken, disabled,
      allNames,
      disabledNames: showDisabledAdvancedFlows ? disabledNames : [],
      brokenNames: showBrokenAdvancedFlows ? brokenNames : []
    };

    if (showDisabledAdvancedFlows) { log('---------------------------------------------'); log('Disabled advanced flow names:'); log(disabledNames.join('\r\n')); log('---------------------------------------------'); }
    if (showBrokenAdvancedFlows) { log('---------------------------------------------'); log('Broken advanced flow names:'); log(brokenNames.join('\r\n')); log('---------------------------------------------'); }

    log(Object.keys(result).length, 'Advanced flows', '('  + broken + ' broken, ' + disabled + ' disabled)');
  })
  .catch(() => log('Failed: Getting Advanced Flows'));

await Homey.apps.getAppSettings({id: 'com.athom.homeyscript'})
  .then(result => {
    // "__mcp_run_*" entries are internal leftovers from ad-hoc (unsaved)
    // script runs via an MCP bridge — not real scripts, so excluded from the count.
    const realEntries = Object.entries(result.scripts).filter(([id, s]) => !(s && s.name && s.name.startsWith('__mcp_run')));
    const names = realEntries.map(([id, s]) => (s && s.name) ? s.name : id);
    report.homeyscript = { scripts: names.length, tokens: Object.keys(result.tokens).length || 0, scriptNames: names };
    log(names.length, 'HomeyScript scripts', '(' + (Object.keys(result.tokens).length || 0) + ' tokens/tags)')
  })
  .catch(err => {log('Failed: Getting HomeyScript')})

await Homey.apps.getAppSettings({id: 'net.i-dev.betterlogic'})
  .then(result => {
    let boolean = 0, number = 0, string = 0;
    Object.keys(result.variables).forEach(function(key) {
      if (result.variables[key].type === 'boolean') boolean++;
      if (result.variables[key].type === 'number') number++;
      if (result.variables[key].type === 'string') string++;
    });
    report.betterLogic = { total: Object.keys(result.variables).length, boolean, number, string };
    log(Object.keys(result.variables).length, 'Better Logic Variables', '(' + boolean + ' boolean (yes/no), ' + number + ' number, ' + string + ' string)');
  })
  .catch(() => {}); // No Better Logic variables or app not installed

log('\r\n----------------- Devices -------------------');
let allDevices = 0, zwave = 0, zwaveDevices = [], zwaveNodes = [], zwaveRouter = 0, zwaveRouterDevices = [], zwaveBattery = 0, zwaveBatteryDevices = [], zwaveSx = 0, zwaveSxDevices = [], zwaveS0 = 0, zwaveS0Devices = [], zwaveS2Auth = 0, zwaveS2AuthDevices = [], zwaveS2Unauth = 0, zwaveS2UnauthDevices = [];

await Homey.devices.getDevices()
  .then(result => {
    let virtual = 0, ir = 0, other = 0, virtualNames = [], irNames = [], otherNames = [], unifiExcluded = 0;

    Object.keys(result).forEach(function(key) {
      const driverId = result[key].driverId || '';

      // UniFi network-presence devices: excluded entirely (see header comment)
      if (driverId.startsWith('homey:app:com.ubnt.unifi')) {
        unifiExcluded++;
        return;
      }

      if (driverId === 'homey:virtualdriverinfrared:driver') {
        ir++; irNames.push(result[key].name);
      }
      else if (driverId.startsWith('homey:virtualdriver')) {
        virtual++; virtualNames.push(result[key].name);
      }
      else if (
        driverId.startsWith('homey:app:com.arjankranenburg.virtual')
        || driverId.startsWith('homey:app:nl.qluster-it.DeviceCapabilities')
        || driverId.startsWith('homey:app:nl.fellownet.chronograph')
        || driverId.startsWith('homey:app:net.i-dev.betterlogic')
      ) {
        virtual++; virtualNames.push(result[key].name);
      }
      else if (result[key].flags.includes('zwaveRoot')) {
        zwave++;
        zwaveDevices.push(result[key].name);
        zwaveNodes.push(Number(result[key].settings.zw_node_id));

        if (result[key].settings.zw_battery === '✓' || result[key].energyObj.batteries) {
          zwaveBattery++; zwaveBatteryDevices.push(result[key].name);
        } else {
          zwaveRouter++; zwaveRouterDevices.push(result[key].name);
        }

        if (result[key].settings.zw_secure === '⨯') {
          zwaveSx++; zwaveSxDevices.push(result[key].name);
        } else if (result[key].settings.zw_secure === '✓' || result[key].settings.zw_secure === 'S0') {
          zwaveS0++; zwaveS0Devices.push(result[key].name);
        } else if (result[key].settings.zw_secure === 'S2 (Authenticated)') {
          zwaveS2Auth++; zwaveS2AuthDevices.push(result[key].name);
        } else if (result[key].settings.zw_secure === 'S2 (Unauthenticated)') {
          zwaveS2Unauth++; zwaveS2UnauthDevices.push(result[key].name);
        }
      }
      else if (!result[key].flags.includes('zwave') && !result[key].flags.includes('zigbee')) {
        other++;
        otherNames.push(result[key].name);
      }
    });

    report.devices = {
      virtual, virtualNames: showVirtualDevices ? virtualNames.sort() : [],
      ir, irNames: showIRDevices ? irNames.sort() : [],
      other, otherNames: showOtherDevices ? otherNames.sort() : [],
      unifiExcluded
    };

    if (showVirtualDevices) { log('---------------------------------------------'); log('Virtual devices:'); log(virtualNames.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }
    if (showIRDevices) { log('---------------------------------------------'); log('Infrared devices:'); log(irNames.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }
    if (showOtherDevices) { log('---------------------------------------------'); log('Other devices:'); log(otherNames.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }

    allDevices += virtual + ir + other + zwave;
    log(virtual, 'Virtual devices');
    log(ir, 'Infrared (database) devices');
    log(other, 'Other devices');
    log(unifiExcluded, 'UniFi network-presence devices excluded');
  })
  .catch(() => log('Failed: Getting Devices'));

await Homey.zwave.getState()
  .then(result => {
    let unknownNodes = result.zw_state.nodes.filter((el) => !zwaveNodes.includes(el)).sort((a, b) => a - b);
    unknownNodes.shift();

    report.zwave = {
      total: zwave,
      devices: showZwaveDevices ? zwaveDevices : [],
      router: zwaveRouter, routerDevices: showZwaveRouterDevices ? zwaveRouterDevices.sort() : [],
      unsecure: zwaveSx, unsecureDevices: showZwaveUnsecureDevices ? zwaveSxDevices.sort() : [],
      s0: zwaveS0, s0Devices: showZwaveSecureS0Devices ? zwaveS0Devices.sort() : [],
      s2auth: zwaveS2Auth, s2authDevices: showZwaveSecureS2AuthenticatedDevices ? zwaveS2AuthDevices.sort() : [],
      s2unauth: zwaveS2Unauth, s2unauthDevices: showZwaveSecureS2UnauthenticatedDevices ? zwaveS2UnauthDevices.sort() : [],
      battery: zwaveBattery, batteryDevices: showZwaveBatteryDevices ? zwaveBatteryDevices.sort() : [],
      unreachable: result.zw_state.noAckNodes.length,
      unreachableNodes: showZwaveUnreachableNodes ? result.zw_state.noAckNodes.sort((a,b)=>a-b) : [],
      unknown: unknownNodes.length,
      unknownNodes: showZwaveUnknownNodes ? unknownNodes : []
    };

    if (showZwaveDevices) { log('---------------------------------------------'); log('Z-Wave devices:'); log(zwaveDevices.join('\r\n')); log('---------------------------------------------'); }
    if (showZwaveRouterDevices) { log('---------------------------------------------'); log('Z-Wave router devices:'); log(zwaveRouterDevices.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }
    if (showZwaveUnsecureDevices) { log('---------------------------------------------'); log('Z-Wave unsecure devices:'); log(zwaveSxDevices.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }
    if (showZwaveSecureS0Devices) { log('---------------------------------------------'); log('Z-Wave secure (S0) devices:'); log(zwaveS0Devices.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }
    if (showZwaveSecureS2AuthenticatedDevices) { log('---------------------------------------------'); log('Z-Wave secure (S2) authenticated devices:'); log(zwaveS2AuthDevices.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }
    if (showZwaveSecureS2UnauthenticatedDevices) { log('---------------------------------------------'); log('Z-Wave secure (S2) Unauthenticated devices:'); log(zwaveS2UnauthDevices.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }
    if (showZwaveBatteryDevices) { log('---------------------------------------------'); log('Z-Wave battery devices:'); log(zwaveBatteryDevices.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }
    if (showZwaveUnreachableNodes) { log('---------------------------------------------'); log('Unreachable nodes:'); log('Node ID:', result.zw_state.noAckNodes.sort((a, b) => a - b).join('\r\nNode ID: ')); log('---------------------------------------------'); }
    if (showZwaveUnknownNodes) { log('---------------------------------------------'); log('Unknown nodes:'); log('Node ID:', unknownNodes.join('\r\nNode ID: ')); log('---------------------------------------------'); }

    log(zwave, 'Z-Wave nodes', '(' + zwaveSx + ' Unsecure, ' + zwaveS0 + ' Secure (S0), ' + zwaveS2Auth + ' Secure (S2 Authenticated), ' + zwaveS2Unauth + ' Secure (S2 Unauthenticated), ' + zwaveRouter + ' router, ' + zwaveBattery + ' battery, ' + result.zw_state.noAckNodes.length + ' unreachable, ' + unknownNodes.length + ' Unknown node(s))')
  })
  .catch(() => { log('Failed: Getting Z-Wave State'); report.zwave = { failed: true }; });

await Homey.zigbee.getState()
  .then(result => {
    let zigbeeDevices = [], router = 0, routerDevices = [], endDevice = 0, endDevices = [];

    Object.keys(result.nodes).forEach(function(key) {
      zigbeeDevices.push(result.nodes[key].name);
      if (result.nodes[key].type === 'Router') { router++; routerDevices.push(result.nodes[key].name); }
      if (result.nodes[key].type === 'EndDevice') { endDevice++; endDevices.push(result.nodes[key].name); }
    });

    report.zigbee = {
      total: Object.keys(result.nodes).length,
      nodes: showZigbeeNodes ? zigbeeDevices : [],
      router, routerDevices: showZigbeeRouter ? routerDevices.sort() : [],
      endDevice, endDevices: showZigbeeEndDevice ? endDevices.sort() : []
    };

    if (showZigbeeNodes) { log('---------------------------------------------'); log('ZigBee nodes:'); log(zigbeeDevices.join('\r\n')); log('---------------------------------------------'); }
    if (showZigbeeRouter) { log('---------------------------------------------'); log('ZigBee routers:'); log(routerDevices.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }
    if (showZigbeeEndDevice) { log('---------------------------------------------'); log('ZigBee end devices:'); log(endDevices.sort((a, b) => a - b).join('\r\n')); log('---------------------------------------------'); }

    allDevices += Object.keys(result.nodes).length;
    log(Object.keys(result.nodes).length, 'Zigbee nodes', '(' + router + ' router, ' + endDevice + ' end device)');
  })
  .catch(() => { log('Failed: Getting ZigBee State'); report.zigbee = { failed: true }; });

report.totalDevices = allDevices;
log(allDevices, 'Total devices');

// ================= Compare with previous scan =================

function arrDiff(prevArr, currArr) {
  if (!Array.isArray(prevArr) || !Array.isArray(currArr)) return null;
  const prevSet = new Set(prevArr);
  const currSet = new Set(currArr);
  const added = currArr.filter(x => !prevSet.has(x));
  const removed = prevArr.filter(x => !currSet.has(x));
  return { added, removed };
}

// Escapes a value for safe HTML embedding
function escName(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Formats a list of item names as bold, HTML-safe, comma-separated text
// with "and" before the last item, e.g. "<strong>A</strong>, <strong>B</strong> and <strong>C</strong>"
function formatList(names) {
  const bolded = names.map(n => `<strong>${escName(n)}</strong>`);
  if (bolded.length === 0) return '';
  if (bolded.length === 1) return bolded[0];
  if (bolded.length === 2) return bolded.join(' and ');
  return bolded.slice(0, -1).join(', ') + ' and ' + bolded[bolded.length - 1];
}

// Produces 0-2 { tag, text } entries for this category (HTML-safe text).
// tag is 'added' or 'removed', used by the caller to pick a level — never inferred
// from the text itself, to avoid fragile string matching.
// addedLabel / removedLabel: e.g. "advanced flows disabled" / "advanced flows re-enabled"
// Use this for categories where the ONLY way an item can leave the subset is a real
// state change (e.g. devices, scripts, users) — not deletion of the item itself.
function diffLines(addedLabel, removedLabel, prevVal, currVal, prevNames, currNames) {
  const out = [];
  const nameDiff = arrDiff(prevNames, currNames);

  if (nameDiff) {
    if (nameDiff.added.length > 0) {
      out.push({ tag: 'added', text: `${nameDiff.added.length} ${addedLabel} since previous scan: ${formatList(nameDiff.added)}` });
    }
    if (nameDiff.removed.length > 0) {
      out.push({ tag: 'removed', text: `${nameDiff.removed.length} ${removedLabel} since previous scan: ${formatList(nameDiff.removed)}` });
    }
    if (out.length === 0 && prevVal !== undefined && prevVal !== null && currVal !== undefined && currVal !== null && prevVal !== currVal) {
      const delta = currVal - prevVal;
      const sign = delta > 0 ? '+' : '';
      out.push({ tag: currVal > prevVal ? 'added' : 'removed', text: `${addedLabel}: ${prevVal} → ${currVal} (${sign}${delta})` });
    }
  } else if (prevVal !== undefined && prevVal !== null && currVal !== undefined && currVal !== null && prevVal !== currVal) {
    const delta = currVal - prevVal;
    const sign = delta > 0 ? '+' : '';
    out.push({ tag: currVal > prevVal ? 'added' : 'removed', text: `${addedLabel}: ${prevVal} → ${currVal} (${sign}${delta})` });
  }

  return out;
}

// Like diffLines, but for categories where an item is a SUBSET of a larger population
// (e.g. "disabled flows" is a subset of "all flows"). An item leaving the subset is only
// reported here if it's a genuine state change (still exists, e.g. re-enabled/fixed).
// If the item no longer exists at all (deleted), it is NOT reported here — that case is
// covered once, generically, by the population-level "created/deleted" diffLines call
// elsewhere, so an item that was e.g. both disabled AND deleted isn't reported twice.
function diffLinesEx(addedLabel, recoveredLabel, prevNames, currNames, currAllNames) {
  const out = [];
  const nameDiff = arrDiff(prevNames, currNames);
  if (!nameDiff) return out;

  if (nameDiff.added.length > 0) {
    out.push({ tag: 'added', text: `${nameDiff.added.length} ${addedLabel} since previous scan: ${formatList(nameDiff.added)}` });
  }
  if (nameDiff.removed.length > 0) {
    const allSet = new Set(currAllNames || []);
    const recovered = nameDiff.removed.filter(n => allSet.has(n));
    if (recovered.length > 0) {
      out.push({ tag: 'recovered', text: `${recovered.length} ${recoveredLabel} since previous scan: ${formatList(recovered)}` });
    }
  }
  return out;
}

const findings = []; // { level: 'crit' | 'warn' | 'info', text } -- text is pre-built, HTML-safe

if (previousSnapshot) {
  // WiFi/Ethernet: report the TRANSITION only, not the ongoing state.
  // (The System section further down always shows the current live status.)
  if (previousSnapshot.wifi !== false && report.wifi === false) {
    findings.push({ level: 'crit', text: '⚠️ WiFi disconnected since previous scan.' });
  } else if (previousSnapshot.wifi === false && report.wifi === true) {
    findings.push({ level: 'info', text: '✅ WiFi reconnected (was disconnected in the previous scan).' });
  }
  if (previousSnapshot.ethernet !== false && report.ethernet === false) {
    findings.push({ level: 'crit', text: '⚠️ Ethernet disconnected since previous scan.' });
  } else if (previousSnapshot.ethernet === false && report.ethernet === true) {
    findings.push({ level: 'info', text: '✅ Ethernet reconnected (was disconnected in the previous scan).' });
  }

  // Users (with names, relevant for security)
  const userDiff = arrDiff(previousSnapshot.userNames, report.users ? report.users.names : undefined);
  if (userDiff && userDiff.added.length > 0) {
    findings.push({ level: 'crit', text: `👤 ${userDiff.added.length} User(s) added since previous scan: ${formatList(userDiff.added)}. Please verify this is expected (possible security issue).` });
  }
  if (userDiff && userDiff.removed.length > 0) {
    findings.push({ level: 'info', text: `👤 ${userDiff.removed.length} User(s) removed since previous scan: ${formatList(userDiff.removed)}.` });
  }

  // Apps (disabled/crashed subset can shrink via re-enable; deletion is reported once, below)
  diffLinesEx('📦 Apps disabled/crashed', '📦 Apps back online', previousSnapshot.appsDisabledNames, report.apps.disabledApps, report.apps.allNames)
    .forEach(({ tag, text }) => findings.push({ level: (tag === 'added' && report.apps.disabled > (previousSnapshot.appsDisabled || 0)) ? 'warn' : 'info', text }));

  // Apps installed/uninstalled (full population, not a subset — names shown instead of a bare count)
  diffLines('📦 Apps installed', '📦 Apps uninstalled', previousSnapshot.appsTotal, report.apps.total, previousSnapshot.appsAllNames, report.apps.allNames)
    .forEach(({ text }) => findings.push({ level: 'info', text }));

  // Basic flows (broken/disabled subsets can shrink via fix/re-enable; deletion is reported once, below)
  diffLinesEx('🔀 Basic flows broken', '🔀 Basic flows fixed (no longer broken)', previousSnapshot.flowsBrokenNames, report.flows.brokenNames, report.flows.allNames)
    .forEach(({ tag, text }) => findings.push({ level: (tag === 'added' && report.flows.broken > (previousSnapshot.flowsBroken || 0)) ? 'crit' : 'info', text }));
  diffLinesEx('🔀 Basic flows disabled', '🔀 Basic flows re-enabled', previousSnapshot.flowsDisabledNames, report.flows.disabledNames, report.flows.allNames)
    .forEach(({ text }) => findings.push({ level: 'info', text }));

  // Basic flows created/deleted (full population — names shown instead of a bare count)
  diffLines('🔀 Basic flows created', '🔀 Basic flows deleted', previousSnapshot.flowsTotal, report.flows.total, previousSnapshot.flowsAllNames, report.flows.allNames)
    .forEach(({ text }) => findings.push({ level: 'info', text }));

  // Advanced flows (same logic)
  diffLinesEx('🔀 Advanced flows broken', '🔀 Advanced flows fixed (no longer broken)', previousSnapshot.advFlowsBrokenNames, report.advancedFlows.brokenNames, report.advancedFlows.allNames)
    .forEach(({ tag, text }) => findings.push({ level: (tag === 'added' && report.advancedFlows.broken > (previousSnapshot.advFlowsBroken || 0)) ? 'crit' : 'info', text }));
  diffLinesEx('🔀 Advanced flows disabled', '🔀 Advanced flows re-enabled', previousSnapshot.advFlowsDisabledNames, report.advancedFlows.disabledNames, report.advancedFlows.allNames)
    .forEach(({ text }) => findings.push({ level: 'info', text }));

  // Advanced flows created/deleted (full population — names shown instead of a bare count)
  diffLines('🔀 Advanced flows created', '🔀 Advanced flows deleted', previousSnapshot.advFlowsTotal, report.advancedFlows.total, previousSnapshot.advFlowsAllNames, report.advancedFlows.allNames)
    .forEach(({ text }) => findings.push({ level: 'info', text }));

  // Logic & Scripts (already full-existence-based, no subset issue)
  if (report.homeyscript) {
    diffLines('🧠 HomeyScript scripts added', '🧠 HomeyScript scripts removed', previousSnapshot.homeyscriptScripts, report.homeyscript.scripts, previousSnapshot.homeyscriptScriptNames, report.homeyscript.scriptNames)
      .forEach(({ text }) => findings.push({ level: 'info', text }));
  }

  // Count-only categories (no meaningful name list available): old arrow notation (numbers only, no escaping needed)
  let l;
  function simpleDiff(label, prevVal, currVal) {
    if (prevVal === undefined || prevVal === null || currVal === undefined || currVal === null || prevVal === currVal) return null;
    const delta = currVal - prevVal;
    const sign = delta > 0 ? '+' : '';
    return `${label}: ${prevVal} → ${currVal} (${sign}${delta})`;
  }
  if (report.logicVars && (l = simpleDiff('🧠 Logic variables', previousSnapshot.logicVarsTotal, report.logicVars.total))) findings.push({ level: 'info', text: l });
  if (report.betterLogic && (l = simpleDiff('🧠 Better Logic variables', previousSnapshot.betterLogicTotal, report.betterLogic.total))) findings.push({ level: 'info', text: l });
  if ((l = simpleDiff('📍 Zones', previousSnapshot.zonesTotal, report.zonesTotal))) findings.push({ level: 'info', text: l });
  // Notification count change intentionally not reported (too noisy)
  if ((l = simpleDiff('📱 Total devices', previousSnapshot.devicesTotal, report.totalDevices))) findings.push({ level: 'info', text: l });
  if ((l = simpleDiff('📱 Infrared devices', previousSnapshot.irDevices, report.devices.ir))) findings.push({ level: 'info', text: l });

  // Devices with name detail (already full-existence-based, no subset issue)
  diffLines('📱 Virtual devices added', '📱 Virtual devices removed', previousSnapshot.virtualDevices, report.devices.virtual, previousSnapshot.virtualDeviceNames, report.devices.virtualNames)
    .forEach(({ text }) => findings.push({ level: 'info', text }));
  diffLines('📱 Other devices added', '📱 Other devices removed', previousSnapshot.otherDevices, report.devices.other, previousSnapshot.otherDeviceNames, report.devices.otherNames)
    .forEach(({ text }) => findings.push({ level: 'info', text }));

  if (report.zwave && !report.zwave.failed) {
    diffLines('📡 Z-Wave devices added', '📡 Z-Wave devices removed', previousSnapshot.zwaveTotal, report.zwave.total, previousSnapshot.zwaveDeviceNames, report.zwave.devices)
      .forEach(({ text }) => findings.push({ level: 'info', text }));
    if ((l = simpleDiff('📡 Z-Wave unreachable nodes', previousSnapshot.zwaveUnreachable, report.zwave.unreachable))) {
      findings.push({ level: report.zwave.unreachable > (previousSnapshot.zwaveUnreachable || 0) ? 'warn' : 'info', text: l });
    }
    if ((l = simpleDiff('📡 Z-Wave unknown nodes', previousSnapshot.zwaveUnknown, report.zwave.unknown))) findings.push({ level: 'info', text: l });
  }
  if (report.zigbee && !report.zigbee.failed) {
    diffLines('📶 Zigbee devices added', '📶 Zigbee devices removed', previousSnapshot.zigbeeTotal, report.zigbee.total, previousSnapshot.zigbeeNodeNames, report.zigbee.nodes)
      .forEach(({ text }) => findings.push({ level: 'info', text }));
  }
} else {
  // First scan: no baseline to compare against, so flag current disconnects live.
  if (report.wifi === false) findings.push({ level: 'crit', text: '⚠️ WiFi is currently not connected.' });
  if (report.ethernet === false) findings.push({ level: 'crit', text: '⚠️ Ethernet is currently not connected.' });
  findings.push({ level: 'info', text: 'ℹ️ This is the first scan with comparison data — changes will be shown here starting from the next scan.' });
}

// Sort: crit first, then warn, then info
const levelRank = { crit: 0, warn: 1, info: 2 };
findings.sort((a, b) => levelRank[a.level] - levelRank[b.level]);

// Save snapshot for next scan (incl. name lists for detail diffs)
const snapshot = {
  ts: new Date().toISOString(),
  wifi: report.wifi, ethernet: report.ethernet,
  usersTotal: report.users ? report.users.total : undefined,
  userNames: report.users ? report.users.names : undefined,
  appsTotal: report.apps.total, appsDisabled: report.apps.disabled, appsDisabledNames: report.apps.disabledApps, appsAllNames: report.apps.allNames,
  flowsTotal: report.flows.total, flowsBroken: report.flows.broken, flowsDisabled: report.flows.disabled,
  flowsBrokenNames: report.flows.brokenNames, flowsDisabledNames: report.flows.disabledNames, flowsAllNames: report.flows.allNames,
  advFlowsTotal: report.advancedFlows.total, advFlowsBroken: report.advancedFlows.broken, advFlowsDisabled: report.advancedFlows.disabled,
  advFlowsBrokenNames: report.advancedFlows.brokenNames, advFlowsDisabledNames: report.advancedFlows.disabledNames, advFlowsAllNames: report.advancedFlows.allNames,
  logicVarsTotal: report.logicVars ? report.logicVars.total : undefined,
  homeyscriptScripts: report.homeyscript ? report.homeyscript.scripts : undefined,
  homeyscriptScriptNames: report.homeyscript ? report.homeyscript.scriptNames : undefined,
  betterLogicTotal: report.betterLogic ? report.betterLogic.total : undefined,
  zonesTotal: report.zonesTotal, notificationsTotal: report.notificationsTotal,
  devicesTotal: report.totalDevices, virtualDevices: report.devices.virtual, virtualDeviceNames: report.devices.virtualNames,
  irDevices: report.devices.ir, otherDevices: report.devices.other, otherDeviceNames: report.devices.otherNames,
  zwaveTotal: (report.zwave && !report.zwave.failed) ? report.zwave.total : undefined,
  zwaveDeviceNames: (report.zwave && !report.zwave.failed) ? report.zwave.devices : undefined,
  zwaveUnreachable: (report.zwave && !report.zwave.failed) ? report.zwave.unreachable : undefined,
  zwaveUnknown: (report.zwave && !report.zwave.failed) ? report.zwave.unknown : undefined,
  zigbeeTotal: (report.zigbee && !report.zigbee.failed) ? report.zigbee.total : undefined,
  zigbeeNodeNames: (report.zigbee && !report.zigbee.failed) ? report.zigbee.nodes : undefined
};

if (snapshotVarId) {
  await Homey.logic.updateVariable({ id: snapshotVarId, variable: { type: 'string', value: JSON.stringify(snapshot) } });
}

// ================= Build HTML report =================

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ul(items) {
  if (!items || items.length === 0) return '<p class="muted">— none —</p>';
  return '<ul>' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>';
}

// Note: f.text is already HTML-safe (built via formatList/escName above), so we do NOT
// re-escape it here — that would turn the intentional <strong> tags into literal text.
function findingsHtml(list) {
  if (list.length === 0) return '<p class="ok">✅ No notable changes since the previous scan.</p>';
  return '<ul class="findings">' + list.map(f => `<li class="${f.level}">${f.text}</li>`).join('') + '</ul>';
}

const now = new Date();
// Explicit timeZone: the HomeyScript sandbox's default timezone doesn't
// necessarily match Homey's configured location (it can run in UTC
// regardless of where your Homey actually is), so without this the
// displayed time can be off by a few hours. See the TIMEZONE setting
// near the top of the script.
const dateStr = now.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: TIMEZONE });

const sections = [];

// Summary (at the top)
sections.push({
  id: 'summary', title: '🔎 Summary & Actions',
  html: findingsHtml(findings)
});

// System
sections.push({
  id: 'system', title: '🏠 System',
  html: `
    <table class="kv">
      <tr><th>Name</th><td>${esc(report.homeyName || '-')}</td></tr>
      <tr><th>Version</th><td>${esc(report.version || '-')}</td></tr>
      <tr><th>Model</th><td>${esc(report.model || '-')} (${report.cores || '-'} core(s))</td></tr>
      <tr><th>Uptime</th><td>${esc(report.uptimeText || '-')}</td></tr>
      <tr><th>WiFi</th><td>${report.wifi === undefined ? '-' : (report.wifi ? '✅ connected' : '❌ not connected')}</td></tr>
      <tr><th>Ethernet</th><td>${report.ethernet === undefined ? '-' : (report.ethernet ? '✅ connected' : '❌ not connected')}</td></tr>
      <tr><th>Update available</th><td>${report.updateAvailable ? '⚠️ ' + esc(report.updateAvailable) : '✅ none'}</td></tr>
      <tr><th>Users</th><td>${report.users ? report.users.total + ' (' + report.users.owner + ' owner, ' + report.users.manager + ' manager, ' + report.users.user + ' user, ' + report.users.guest + ' guest)' : '-'}</td></tr>
      <tr><th>Zones</th><td>${report.zonesTotal ?? '-'}</td></tr>
      <tr><th>Notifications (Timeline)</th><td>${report.notificationsTotal ?? '-'}</td></tr>
    </table>`
});

// Apps
sections.push({
  id: 'apps', title: '📦 Apps',
  html: `
    <p><strong>${report.apps.total}</strong> apps total — ${report.apps.sdkv2} SDKv2, ${report.apps.sdkv3} SDKv3, <strong>${report.apps.updateable}</strong> updates available, <strong>${report.apps.disabled}</strong> disabled/crashed.</p>
    <h3>Updates available</h3>${ul(report.apps.updateableApps)}
    <h3>Disabled / crashed</h3>${ul(report.apps.disabledApps)}
    <h3>SDKv2 apps</h3>${ul(report.apps.sdkv2Apps)}
  `
});

// Flows
sections.push({
  id: 'flows', title: '🔀 Flows',
  html: `
    <p><strong>Basic flows:</strong> ${report.flows.total} total, ${report.flows.broken} broken, ${report.flows.disabled} disabled.</p>
    <h3>Disabled basic flows</h3>${ul(report.flows.disabledNames)}
    <h3>Broken basic flows</h3>${ul(report.flows.brokenNames)}
    <p><strong>Advanced flows:</strong> ${report.advancedFlows.total} total, ${report.advancedFlows.broken} broken, ${report.advancedFlows.disabled} disabled.</p>
    <h3>Disabled advanced flows</h3>${ul(report.advancedFlows.disabledNames)}
    <h3>Broken advanced flows</h3>${ul(report.advancedFlows.brokenNames)}
  `
});

// Logic & scripts
sections.push({
  id: 'logic', title: '🧠 Logic & Scripts',
  html: `
    <table class="kv">
      <tr><th>Logic variables</th><td>${report.logicVars ? report.logicVars.total + ' (' + report.logicVars.boolean + ' boolean, ' + report.logicVars.number + ' number, ' + report.logicVars.string + ' string)' : '-'}</td></tr>
      <tr><th>HomeyScript scripts</th><td>${report.homeyscript ? report.homeyscript.scripts + ' (' + report.homeyscript.tokens + ' tokens/tags)' : '-'}</td></tr>
      <tr><th>Better Logic variables</th><td>${report.betterLogic ? report.betterLogic.total + ' (' + report.betterLogic.boolean + ' boolean, ' + report.betterLogic.number + ' number, ' + report.betterLogic.string + ' string)' : 'not installed'}</td></tr>
    </table>
  `
});

// Devices - overview
sections.push({
  id: 'devices', title: '📱 Devices — Overview',
  html: `
    <table class="kv">
      <tr><th>Total devices</th><td><strong>${report.totalDevices}</strong></td></tr>
      <tr><th>Virtual devices</th><td>${report.devices.virtual}</td></tr>
      <tr><th>Infrared devices</th><td>${report.devices.ir}</td></tr>
      <tr><th>Other devices</th><td>${report.devices.other}</td></tr>
      <tr><th>Z-Wave nodes</th><td>${report.zwave && !report.zwave.failed ? report.zwave.total : 'unknown'}</td></tr>
      <tr><th>Zigbee nodes</th><td>${report.zigbee && !report.zigbee.failed ? report.zigbee.total : 'unknown'}</td></tr>
    </table>
    <p class="muted">${report.devices.unifiExcluded || 0} UniFi network-presence devices excluded from all counts and diffs above (see script notes).</p>
    <h3>Virtual devices</h3>${ul(report.devices.virtualNames)}
    <h3>Other devices (WiFi, Bluetooth, Thread/Matter, cloud apps — no protocol-level health data available)</h3>${ul(report.devices.otherNames)}
  `
});

// Z-Wave
if (report.zwave && !report.zwave.failed) {
  sections.push({
    id: 'zwave', title: '📡 Z-Wave',
    html: `
      <p><strong>${report.zwave.total}</strong> nodes — ${report.zwave.unsecure} unsecure, ${report.zwave.s0} S0, ${report.zwave.s2auth} S2 (auth), ${report.zwave.s2unauth} S2 (unauth), ${report.zwave.router} router, ${report.zwave.battery} battery, ${report.zwave.unreachable} unreachable, ${report.zwave.unknown} unknown node(s).</p>
      <h3>Unreachable nodes</h3>${ul(report.zwave.unreachableNodes.map(n => 'Node ' + n))}
      <h3>Unknown nodes</h3>${ul(report.zwave.unknownNodes.map(n => 'Node ' + n))}
      <h3>Battery devices</h3>${ul(report.zwave.batteryDevices)}
      <h3>All Z-Wave devices</h3>${ul(report.zwave.devices)}
    `
  });
} else {
  sections.push({ id: 'zwave', title: '📡 Z-Wave', html: '<p class="muted">Could not retrieve Z-Wave status.</p>' });
}

// Zigbee
if (report.zigbee && !report.zigbee.failed) {
  sections.push({
    id: 'zigbee', title: '📶 Zigbee',
    html: `
      <p><strong>${report.zigbee.total}</strong> nodes — ${report.zigbee.router} router, ${report.zigbee.endDevice} end device.</p>
      <h3>All Zigbee nodes</h3>${ul(report.zigbee.nodes)}
    `
  });
} else {
  sections.push({ id: 'zigbee', title: '📶 Zigbee', html: '<p class="muted">Could not retrieve Zigbee status.</p>' });
}

const toc = sections.map(s => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('');
const body = sections.map(s => `<h2 id="${s.id}">${esc(s.title)}</h2>${s.html}<p class="backtotop"><a href="#top">▲ Back to top</a></p>`).join('');

const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <style>
    h1 { font-size:20px; margin-bottom:4px; }
    .subtitle { color:#666; font-size:13px; margin-top:0; margin-bottom:20px; }
    h2 { font-size:16px; border-bottom:2px solid #2a7de1; padding-bottom:4px; margin-top:28px; }
    h3 { font-size:13px; color:#444; margin-bottom:4px; margin-top:14px; }
    table.kv { border-collapse:collapse; width:100%; font-size:13px; }
    table.kv th { text-align:left; padding:4px 8px 4px 0; color:#555; width:40%; vertical-align:top; }
    table.kv td { padding:4px 0; }
    ul { margin:4px 0; padding-left:20px; font-size:13px; }
    li { margin-bottom:2px; }
    .muted { color:#999; font-size:13px; margin:4px 0; }
    .ok { color:#27ae60; font-size:13px; margin:4px 0; }
    ul.findings { list-style:none; padding-left:0; }
    ul.findings li { padding:6px 10px; margin-bottom:4px; border-radius:4px; font-size:13px; }
    ul.findings li.crit { background:#fdecea; color:#c0392b; font-weight:600; border-left:3px solid #c0392b; }
    ul.findings li.warn { background:#fef6e7; color:#b9770e; border-left:3px solid #d68910; }
    ul.findings li.info { background:#f4f7fb; color:#333; border-left:3px solid #90a4ba; }
    .toc { background:#f4f7fb; border:1px solid #dce6f2; border-radius:6px; padding:12px 16px; margin-bottom:8px; }
    .toc ul { list-style:none; padding-left:0; margin:0; }
    .toc li { margin-bottom:4px; }
    .toc a { color:#2a7de1; text-decoration:none; font-size:13px; }
    .toc a:hover { text-decoration:underline; }
    .backtotop { text-align:right; margin:6px 0 0 0; }
    .backtotop a { color:#2a7de1; text-decoration:none; font-size:12px; }
    .backtotop a:hover { text-decoration:underline; }
    .footer { color:#999; font-size:11px; margin-top:30px; border-top:1px solid #eee; padding-top:10px; }
  </style>

  <a id="top"></a>
  <h1>Homey Overview</h1>
  <p class="subtitle">${esc(dateStr)} — v${esc(VERSION)}</p>

  <div class="toc">
    <strong style="font-size:13px;">Table of Contents</strong>
    <ul>${toc}</ul>
  </div>

  ${body}

  <p class="footer">Automatically generated by HomeyScript.</p>
</div>
`;

for (const addr of mailToList) {
  await Homey.flow.runFlowCardAction({
    id: 'homey:app:email.sender:sendmail',
    args: { mailto: addr, subject: 'Homey Overview — ' + dateStr, body: html }
  });
  log('Email sent to', addr);
}

return 'Overview finished, email sent to ' + mailToList.join(', ');
