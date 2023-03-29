const {
    default: OBSWebSocket,
    EventSubscription
  } = require('obs-websocket-js'),
  obs = new OBSWebSocket(),
  sm = require('./sm-comm');

let comm = null;


// Additional methods
class Additional {
  static async GetScenesAndGroups(withSources, withFilters) {
    return {
      scenes: await Additional.GetScenes(withSources, withFilters),
      groups: await Additional.GetGroups(withSources, withFilters)
    }
  }

  static async GetGroups(withSources, withFilters) {
    let groups = [];
    for (const groupName of (await obs.call('GetGroupList')).groups) {
      if (groupName.length) {
        groups.push(await Additional.GetGroup(groupName, withSources, withFilters));
      }
    }

    return groups;
  }

  static async GetGroup(groupName, withSources, withFilters) {
    let group = await Additional.GetSource(groupName);
    if (group && withSources) {
      group.sources = (await obs.call('GetGroupSceneItemList', { sceneName: groupName })).sceneItems || [];
      if (withFilters) {
        group.filters = await Additional.GetFilters(groupName);
      }
    }

    return group;
  }

  static async GetScenes(withSources, withFilters) {
    let scenes = [];
    for (let scene of (await obs.call('GetSceneList')).scenes) {
      if (scene.sceneName.length && withSources) {
        scene.sources = await Additional.GetSources(scene.sceneName, withFilters);
        if (withFilters) {
          scene.filters = await Additional.GetFilters(scene.sceneName);
        }
      }

      scenes.push(scene);
    }

    return scenes;
  }

  static async GetScene(sceneName, withSources, withFilters) {
    for (const scene of await Additional.GetScenes(withSources, withFilters)) {
      if (sceneName.toLowerCase() === scene.sceneName.toLowerCase()) {
        return scene;
      }
    }

    return false;
  }

  static async GetSources(sceneName, withFilters) {
    if (typeof sceneName !== 'string' || !sceneName.length) {
      let checked = [];
      let sources = [];
      for (const scene of await Additional.GetScenes(true, withFilters)) {
        for (const source of scene.sources) {
          if (source.sourceName && checked.indexOf(source.sourceName) < 0) {
            checked.push(source.sourceName);
            sources.push(source);
          }
        }
      }

      return sources;
    }

    let sources = (await obs.call('GetSceneItemList', { sceneName })).sceneItems;
    if (withFilters) {
      for (let source of sources) {
        if (source.sourceName.length) {
          source.filters = await Additional.GetFilters(source.sourceName);
        }
      }
    }

    return sources;
  }

  static async GetSource(sourceName, sceneName) {
    for (const source of await Additional.GetSources(sceneName)) {
      if (sourceName.toLowerCase() === source.sourceName.toLowerCase()) {
        return source;
      }
    }

    return false;
  }

  static async GetFilters(sourceName) {
    if (typeof sourceName !== 'string' || !sourceName.length) {
      let checked = [];
      let filters = [];
      for (const scene of await Additional.GetScenes(true)) {
        for (const source of scene.sources) {
          if (source.sourceName && checked.indexOf(source.sourceName) < 0) {
            checked.push(source.sourceName);
            filters = filters.concat(await Additional.GetFilters(source.sourceName));
          }
        }
      }

      return filters;
    }

    return (await obs.call('GetSourceFilterList', { sourceName })).filters;
  }

  static async GetFilter(filterName, sourceName) {
    let filter = await obs.call('GetSourceFilter', { sourceName, filterName });
    filter.filterName = filterName;

    return filter;
  }

  static async SetCurrentScene(sceneName) {
    return await obs.call('SetCurrentProgramScene', { sceneName });
  }

  static async SetSourceSettings(sourceName, settings, reset) {
    return await obs.call('SetInputSettings', { inputName: sourceName, inputSettings: settings, overlay: !reset });
  }

  static async LockSource(source, sceneName, sceneItemLocked) {
    source = await Additional.GetSource(((typeof source === 'string') ? source : source.sourceName), sceneName);
    if (typeof sceneItemLocked === 'undefined') {
      sceneItemLocked = !source.sceneItemLocked;
    }

    return await obs.call('SetSceneItemLocked', { sceneName, sceneItemId: source.sceneItemId, sceneItemLocked });
  }

  static async ToggleSource(source, sceneName, sceneItemEnabled) {
    source = await Additional.GetSource(((typeof source === 'string') ? source : source.sourceName), sceneName);
    if (typeof sceneItemEnabled === 'undefined') {
      sceneItemEnabled = !source.sceneItemEnabled;
    }

    return await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: source.sceneItemId, sceneItemEnabled });
  }

  static async ToggleFilter(filter, sourceName, filterEnabled) {
    filter = await Additional.GetFilter(((typeof filter === 'string') ? filter : filter.filterName), sourceName);
    if (typeof filterEnabled === 'undefined') {
      filterEnabled = !filter.filterEnabled;
    }

    return await obs.call('SetSourceFilterEnabled', { sourceName, filterName: filter.filterName, filterEnabled });
  }

  static async ToggleStudioMode(studioModeEnabled) {
    if (typeof studioModeEnabled === 'undefined') {
      studioModeEnabled = !(await obs.call('GetStudioModeEnabled')).studioModeEnabled;
    }

    return await obs.call('SetStudioModeEnabled', { studioModeEnabled });
  }
}


// Shared methods
class Shared {
  logs = [];
  changes = false;
  connected = false;
  connected_before = true;

  constructor(config, vars) {
    this.vars = vars;
    this.config = config;

    const methods = [
      'CurrentSceneCollectionChanged',
      'CurrentSceneCollectionChanging',
      'CurrentSceneTransitionChanged',
      'CurrentPreviewSceneChanged',
      'CurrentProfileChanged',
      'CurrentProfileChanging',
      'CurrentProgramSceneChanged',
      'CurrentSceneTransitionDurationChanged',
      'CustomEvent',
      'ExitStarted',
      'InputCreated',
      'InputActiveStateChanged',
      'InputAudioBalanceChanged',
      'InputAudioMonitorTypeChanged',
      'InputAudioSyncOffsetChanged',
      'InputAudioTracksChanged',
      'InputMuteStateChanged',
      'InputNameChanged',
      'InputRemoved',
      'InputShowStateChanged',
      'InputVolumeChanged',
      'InputVolumeMeters',
      'MediaInputActionTriggered',
      'MediaInputPlaybackEnded',
      'MediaInputPlaybackStarted',
      'ProfileListChanged',
      'RecordStateChanged',
      'ReplayBufferSaved',
      'ReplayBufferStateChanged',
      'SceneCreated',
      'SceneCollectionListChanged',
      'SceneItemCreated',
      'SceneItemEnableStateChanged',
      'SceneItemListReindexed',
      'SceneItemLockStateChanged',
      'SceneItemRemoved',
      'SceneItemSelected',
      'SceneItemTransformChanged',
      'SceneListChanged',
      'SceneNameChanged',
      'SceneRemoved',
      'SceneTransitionEnded',
      'SceneTransitionStarted',
      'SceneTransitionVideoEnded',
      'ScreenshotSaved',
      'SourceFilterCreated',
      'SourceFilterEnableStateChanged',
      'SourceFilterListReindexed',
      'SourceFilterNameChanged',
      'SourceFilterRemoved',
      'StreamStateChanged',
      'StudioModeStateChanged',
      'VendorEvent',
      'VirtualcamStateChanged',

      'ConnectionOpened',
      'ConnectionClosed',
      'AuthenticationSuccess',
      'AuthenticationFailure',
      'error'
    ];

    for (const method of methods) {
      obs.on(method, data => {
        if ((this.connected && method === 'ConnectionOpened') || (!this.connected && method === 'ConnectionClosed')) {
          return;
        } else if (method === 'ConnectionOpened') {
          this.connected = true;
          this.connected_before = true;
          comm.send('manager', 'state', 'set', false, 'connected');
        } else if (method === 'ConnectionClosed') {
          this.connected = false;
          comm.send('manager', 'state', 'set', false, 'disconnected');
        }

        const obj = {
          type: method,
          date: Date.now()
        };

        this.logs.unshift(obj);
        for (let i = (this.logs.length - 1); i >= 20; --i) {
          delete this.logs[i];
        }

        data = ((typeof data !== 'undefined') ? JSON.parse(JSON.stringify(data)) : data);

        comm.send('manager', 'interface', 'logs', false, obj);
        comm.broadcast(method, data);
      });
    }

    setInterval(() => {
      if (this.config.default.enabled && !this.connected) {
        this.reconnect();
      }
    }, 5000);

    if (this.config.default.enabled) {
      this.connect();
    }
  }

  async show(id, property, data) {
    if (data) {
      comm.send('manager', 'interface', 'logs', false, this.logs);
      comm.send('manager', 'interface', 'config', false, this.config);
    } else if (this.changes && this.config.default.enabled) {
      this.reconnect();
    }
  }

  async enable(id, property, data) {
    this.config.default.enabled = data;
    if (!this.config.default.enabled) {
      this.disconnect();
    } else {
      this.connect();
    }
  }

  async interface(id, property, data) {
    if (property === 'refresh') {
      if (this.config.default.enabled && this.changes) {
        this.reconnect();
      }

      return;
    }

    if (typeof data === typeof this.config.connection[property]) {
      this.changes = true;
      this.config.connection[property] = data;
    }

    comm.send('manager', 'config', 'save', false, this.config);
  }

  async connect(id, property, broadcast) {
    if (this.config.default.enabled) {
      if ((typeof broadcast === 'undefined' && this.connected_before) || broadcast) {
        this.connected_before = false;
        comm.broadcast('Connection');
      }

      this.changes = false;
      obs.connect(this.config.connection.address, this.config.connection.password, {
        eventSubscriptions: EventSubscription.All,
        rpcVersion: 1
      }).then(() => {
        //console.log(`${this.config.default.name} connected`);
      }).catch(error => {
        //console.log(`${this.config.default.name} connection error:`, error);
      });
    }
  }

  async disconnect(id, property, broadcast) {
    if ((typeof broadcast === 'undefined' && this.connected) || broadcast) {
      comm.broadcast('Disconnection');
    }

    if (this.connected) {
      this.connected = false;
      obs.disconnect().catch(() => {});
    }

    comm.send('manager', 'state', (this.config.default.enabled ? 'set' : 'unset'), false, 'disconnected');
  }

  async reconnect(id, property, broadcast) {
    this.disconnect(broadcast);
    this.connect(broadcast);
  }

  async call(id, property, data) {
    if (this.config.default.enabled) {
      if (this.connected) {
        if (typeof Additional[property] === 'function') {
          if (Array.isArray(data) && data.length) {
            return await Additional[property](...data);
          } else {
            return await Additional[property]();
          }
        } else {
          return await obs.call(property, data);
        }
      }
    }
  }
}

module.exports = sender => {
  comm = new sm(Shared, sender);
  return {
    receive: (data) => {
      return comm.receive(data);
    }
  };
};