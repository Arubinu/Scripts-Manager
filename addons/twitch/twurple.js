const { ApiClient } = require('@twurple/api'),
  { ChatClient } = require('@twurple/chat'),
  { PubSubClient } = require('@twurple/pubsub'),
  { StaticAuthProvider } = require('@twurple/auth'),
  { EventSubWsListener } = require('@twurple/eventsub-ws');

let channel = { id: '', name: '', joined: [] },
  channel_ids = {},
  api_client = null,
  chat_client = null,
  chat_listeners = {
    Action: null,
    Announcement: null,
    AnyMessage: null,
    AuthenticationFailure: null,
    Ban: null,
    BitsBadgeUpgrade: null,
    ChatClear: null,
    CommunityPayForward: null,
    CommunitySub: null,
    Connect: null,
    Ctcp: null,
    CtcpReply: null,
    Disconnect: null,
    EmoteOnly: null,
    FollowersOnly: null,
    GiftPaidUpgrade: null,
    Host: null,
    Hosted: null,
    HostsRemaining: null,
    Join: null,
    JoinFailure: null,
    Message: null,
    MessageFailed: null,
    MessageRatelimit: null,
    MessageRemove: null,
    NickChange: null,
    NoPermission: null,
    Notice: null,
    Part: null,
    PasswordError: null,
    PrimeCommunityGift: null,
    PrimePaidUpgrade: null,
    R9k: null,
    Raid: null,
    RaidCancel: null,
    Register: null,
    Resub: null,
    RewardGift: null,
    ritual: null,
    Slow: null,
    StandardPayForward: null,
    Sub: null,
    SubExtend: null,
    SubGift: null,
    Timeout: null,
    SubsOnly: null,
    Unhost: null,
    Whisper: null,
  },
  ws_listener = null,
  ws_listeners = {
    StreamOnline: null,
    StreamOffline: null,
    ChannelUpdate: null,
    ChannelFollow: null,
    ChannelSubscription: null,
    ChannelSubscriptionGift: null,
    ChannelSubscriptionMessage: null,
    ChannelSubscriptionEnd: null,
    ChannelCheer: null,
    ChannelCharityCampaignStart: null,
    ChannelCharityCampaignStop: null,
    ChannelCharityDonation: null,
    ChannelCharityCampaignProgress: null,
    ChannelBan: null,
    ChannelUnban: null,
    ChannelShieldModeBegin: null,
    ChannelShieldModeEnd: null,
    ChannelModeratorAdd: null,
    ChannelModeratorRemove: null,
    ChannelRaidFrom: null,
    ChannelRaidTo: null,
    ChannelRewardAdd: null,
    ChannelRewardUpdate: null,
    ChannelRewardRemove: null,
    ChannelRedemptionAdd: null,
    ChannelRedemptionUpdate: null,
    ChannelPollBegin: null,
    ChannelPollProgress: null,
    ChannelPollEnd: null,
    ChannelPredictionBegin: null,
    ChannelPredictionProgress: null,
    ChannelPredictionLock: null,
    ChannelPredictionEnd: null,
    ChannelGoalBegin: null,
    ChannelGoalProgress: null,
    ChannelGoalEnd: null,
    ChannelHypeTrainBegin: null,
    ChannelHypeTrainProgress: null,
    ChannelHypeTrainEnd: null,
    ExtensionBitsTransactionCreate: null,
    UserAuthorizationGrant: null,
    UserAuthorizationRevoke: null,
    UserUpdate: null,
  },
  pubsub_client = null,
  pubsub_listeners = {
    Subscription: null,
    Redemption: null,
  };

const methods = {
  isStreamLive: async userName => {
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    return await user.getStream() !== null;
  },
  checkFollow: async (userName, userIdCheck) => {
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    return await api_client.users.getFollowFromUserToBroadcaster(userIdCheck, user.id);
  },
  getChatUsers: async () => {
    return channel.joined;
  },
  getAllClipsForBroadcaster: async userName => {
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    return api_client.clips.getClipsForBroadcasterPaginated(user.id).getAll();
  },
  getSubscriptions: async userName => {
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    return api_client.subscriptions.getSubscriptionsPaginated(user.id).getTotalCount();
  },
  getSubscriptionsUsers: async userName => {
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    return api_client.subscriptions.getSubscriptionsPaginated(user.id).getAll();
  },
  getAllRewards: async (userName, onlyManageable) => {
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    return api_client.channelPoints.getCustomRewards(user.id, onlyManageable);
  },
  getChannelGame: async userName => {
    if (!api_client)
      return false;

    const info = await methods.getChannelInfo(userName || channel.name);
    if (!info)
      return false;

    return await info.getGame();
  },
  getChannelInfo: async userName => {
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    return await api_client.channels.getChannelInfo(user.id);
  },
  updateChannelInfo: async (userName, title, game) => {
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    if (game)
    {
      const tgame = await api_client.games.getGameByName(game);
      game = ((tgame && tgame.id) ? tgame.id : false);
    }

    if (!title && !game)
      return false;

    return await api_client.channels.updateChannelInfo(user.id, {
      title: (title || undefined),
      gameId: (game || undefined)
    });
  },
  updateReward: async (userName, rewardId, isEnabled, isPaused) => { // Doesn't work if the reward was not created by the app
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    const data = {};
    if (typeof(isPaused) === 'boolean')
      data.isPaused = isPaused;
    if (typeof(isEnabled) === 'boolean')
      data.isEnabled = isEnabled;

    return api_client.channelPoints.updateCustomReward(user.id, rewardId, data);
  },
  updateSettings: async (userName, settings) => {
    if (!api_client)
      return false;

    const user = await getChannelUser(userName || channel.name);
    if (!user)
      return false;

    return await api_client.chat.updateSettings(user.id, user.id, settings);
  }
};


function convert(obj)
{
  let items;
  if (Array.isArray(obj))
  {
    items = [];
    for (const item of obj)
      items.push(convert(item));
  }
  else if (typeof(obj) === 'object')
  {
    try
    {
      const name = obj.constructor.name;

      let keys = [];
      if (name === 'HelixCustomReward')
        keys = ['autoFulfill', 'backgroundColor', 'broadcasterDisplayName', 'broadcasterId', 'broadcasterName', 'cooldownExpiryDate', 'cost', 'globalCooldown', 'id', 'isEnabled', 'isInStock', 'isPaused', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'prompt', 'redemptionsThisStream', 'title', 'userInputRequired'];
      else if (name === 'HelixChannel')
        keys = ['delay', 'displayName', 'gameId', 'gameName', 'id', 'language', 'name', 'title'];
      else if (name === 'HelixGame')
        keys = ['boxArtUrl', 'id', 'name'];

      items = {};
      for (const key of keys)
      {
        if (obj[key] !== 'undefined')
          items[key] = obj[key];
      }
    }
    catch (e)
    {
      items = obj;
    }
  }
  else
    items = obj;

  return items;
}


async function getChannelUser(userName)
{
  if (typeof(channel_ids[userName]) !== 'undefined' && channel_ids[userName].expire > Date.now())
    return channel_ids[userName].user;

  const user = await api_client.users.getUserByName(userName);
  if (user)
    channel_ids[userName] = { user, expire: (Date.now() + (5 * 60 * 1000)) };

  return user;
}

async function connect(clientId, accessToken, channelName, callback)
{
  channel.id = '';
  channel.name = channelName;
  channel.joined = [];

  const auth_provider = new StaticAuthProvider(clientId, accessToken);

  api_client = new ApiClient({ authProvider: auth_provider });
  chat_client = new ChatClient({ authProvider: auth_provider, channels: [channel.name], requestMembershipEvents: true });
  ws_listener = new EventSubWsListener({ apiClient: api_client });
  pubsub_client = new PubSubClient();

  channel.id = (await api_client.users.getUserByName(channel.name)).id;
  const pubsub_userid = await pubsub_client.registerUserListener(auth_provider);

  // Fires when a user sends an action (/me) to a channel.
  chat_listeners.Action = chat_client.onAction(async (_channel, user, message, msg) => {
    callback(await get('Action', msg, message, user));
  });

  // Fires when a user sends an announcement (/announce) to a channel.
  chat_listeners.Announcement = chat_client.onAnnouncement(async (_channel, user, announcementInfo, msg) => {
    callback(await get('Announcement', msg, null, user, { announcement: { user, info: announcementInfo } }));
  });

  // Fires when authentication fails.
  chat_listeners.AuthenticationFailure = chat_client.onAuthenticationFailure(async (message, retryCount) => {
    callback(await get('AuthenticationFailure', null, message, null, { retry: retryCount }));
  });

  // Fires when a user is permanently banned from a channel.
  chat_listeners.Ban = chat_client.onBan(async (_channel, user, msg) => {
    callback(await get('Ban', msg, null, user, { ban: user }));
  });

  // Fires when a user upgrades their bits badge in a channel.
  chat_listeners.BitsBadgeUpgrade = chat_client.onBitsBadgeUpgrade(async (_channel, user, upgradeInfo, msg) => {
    callback(await get('BitsBadgeUpgrade', msg, null, user, { upgrade: { user, info: upgradeInfo } }));
  });

  // Fires when the chat of a channel is cleared.
  chat_listeners.ChatClear = chat_client.onChatClear(async (_channel, msg) => {
    callback(await get('ChatClear', msg, null, null));
  });

  // Fires when a user pays forward a subscription that was gifted to them to the community.
  chat_listeners.CommunityPayForward = chat_client.onCommunityPayForward(async (_channel, user, forwardInfo, msg) => {
    callback(await get('CommunityPayForward', msg, null, user, { community: { forward: forwardInfo } }));
  });

  // Fires when a user gifts random subscriptions to the community of a channel.
  chat_listeners.CommunitySub = chat_client.onCommunitySub(async (_channel, user, subInfo, msg) => {
    callback(await get('CommunitySub', msg, null, user, { subscribe: { user, info: subInfo } }));
  });

  chat_listeners.Connect = chat_client.onConnect(async () => {
    callback(await get('Connect', null, null, null));
  });

  chat_listeners.Ctcp = chat_client.onCtcp(async (target, user, command, params, msg) => {
    callback(await get('Ctcp', msg, command, user, { ctcp: { target, params } }));
  });

  chat_listeners.CtcpReply = chat_client.onCtcpReply(async (target, user, command, params, msg) => {
    callback(await get('CtcpReply', msg, command, user, { ctcp: { target, params } }));
  });

  chat_listeners.Disconnect = chat_client.onDisconnect(async (manually, reason) => {
    callback(await get('Disconnect', null, null, null, { reason, manually }));

    channel.joined = [];
  });

  // Fires when emote-only mode is toggled in a channel.
  chat_listeners.EmoteOnly = chat_client.onEmoteOnly(async (_channel, enabled) => {
    callback(await get('EmoteOnly', null, null, null, { emote_only: { enabled } }));
  });

  // Fires when followers-only mode is toggled in a channel.
  chat_listeners.FollowersOnly = chat_client.onFollowersOnly(async (_channel, enabled, delay) => {
    callback(await get('FollowersOnly', null, null, null, { follower_only: { enabled, delay } }));
  });

  // Fires when a user upgrades their gift subscription to a paid subscription in a channel.
  chat_listeners.GiftPaidUpgrade = chat_client.onGiftPaidUpgrade(async (_channel, user, subInfo, msg) => {
    callback(await get('GiftPaidUpgrade', msg, null, user, { subscribe: { user, info: subInfo } }));
  });

  // Fires when a channel hosts another channel.
  chat_listeners.Host = chat_client.onHost(async (_channel, target, viewers) => {
    callback(await get('Host', null, null, null, { host: { channel: target, viewers } }));
  });

  // Fires when a channel you're logged in as its owner is being hosted by another channel.
  chat_listeners.Hosted = chat_client.onHosted(async (_channel, byChannel, auto, viewers) => {
    callback(await get('Hosted', null, null, byChannel, { host: { channel: byChannel, viewers, auto } }));
  });

  // Fires when Twitch tells you the number of hosts you have remaining in the next half hour for the channel for which you're logged in as owner after hosting a channel.
  chat_listeners.HostsRemaining = chat_client.onHostsRemaining(async (_channel, numberOfHosts) => {
    callback(await get('HostsRemaining', null, null, null, { host: { remaining: numberOfHosts } }));
  });

  // Fires when a user joins a channel.
  chat_listeners.Join = chat_client.onJoin(async (_channel, user) => {
    callback(await get('Join', null, null, user));

    channel.joined.push(user);
  });

  // Fires when you fail to join a channel.
  chat_listeners.JoinFailure = chat_client.onJoinFailure(async (_channel, reason) => {
    callback(await get('JoinFailure', null, null, null, { reason }));
  });

  chat_listeners.Message = chat_client.onMessage(async (_channel, user, message, msg) => {
    callback(await get('Message', msg, message, user));
  });

  // Fires when a message you tried to send gets rejected by the ratelimiter.
  chat_listeners.MessageFailed = chat_client.onMessageFailed(async (_channel, reason) => {
    callback(await get('MessageFailed', null, null, null, { reason }));
  });

  // Fires when a message you tried to send gets rejected by the ratelimiter.
  chat_listeners.MessageRatelimit = chat_client.onMessageRatelimit(async (_channel, message) => {
    callback(await get('MessageRatelimit', null, message, null));
  });

  // Fires when a single message is removed from a channel.
  chat_listeners.MessageRemove = chat_client.onMessageRemove(async (_channel, messageId, msg) => {
    callback(await get('MessageRemove', msg, null, null));
  });

  chat_listeners.NickChange = chat_client.onNickChange(async (oldNick, newNick, msg) => {
    callback(await get('NickChange', msg, null, newNick, { user: { old: oldNick } }));
  });

  // Fires when you tried to execute a command you don't have sufficient permission for.
  chat_listeners.NoPermission = chat_client.onNoPermission(async (_channel, message) => {
    callback(await get('NoPermission', null, message, null));
  });

  // Sent to indicate the outcome of an action like banning a user (eg. /emoteonly, /subscribers, /ban or /host).
  // peut-être au raid aussi ou au fin de live
  chat_listeners.Notice = chat_client.onNotice(async (target, user, message, msg) => {
    callback(await get('Notice', msg, message, user, { notice: { user, target } }));
  });

  // Fires when a user leaves ("parts") a channel.
  chat_listeners.Part = chat_client.onPart(async (_channel, user) => {
    callback(await get('Part', null, null, user));

    const index = channel.joined.indexOf(user);
    if (index > -1)
      channel.joined.splice(index, 1);
  });

  chat_listeners.PasswordError = chat_client.onPasswordError(async error => {
    callback(await get('PasswordError', null, null, null, { error }));
  });

  // Fires when a user gifts a Twitch Prime benefit to the channel.
  chat_listeners.PrimeCommunityGift = chat_client.onPrimeCommunityGift(async (_channel, user, subInfo, msg) => {
    callback(await get('PrimeCommunityGift', msg, null, user));
  });

  // Fires when a user upgrades their Prime subscription to a paid subscription in a channel.
  chat_listeners.PrimePaidUpgrade = chat_client.onPrimePaidUpgrade(async (_channel, user, subInfo, msg) => {
    callback(await get('PrimePaidUpgrade', msg, null, user));
  });

  // Fires when R9K mode is toggled in a channel (UniqueChat).
  chat_listeners.R9k = chat_client.onR9k(async (_channel, enabled) => {
    callback(await get('R9k', null, null, null, { r9k: enabled }));
  });

  // Fires when a user raids a channel.
  chat_listeners.Raid = chat_client.onRaid(async (_channel, user, raidInfo, msg) => {
    callback(await get('Raid', msg, null, user, { raid: { channel: user, info: raidInfo } }));
  });

  // Fires when a user cancels a raid.
  chat_listeners.RaidCancel = chat_client.onRaidCancel(async (_channel, msg) => {
    callback(await get('RaidCancel', msg, null, null));
  });

  chat_listeners.Register = chat_client.onRegister(async () => {
    callback(await get('Register', null, null, null));
  });

  // Fires when a user resubscribes to a channel.
  chat_listeners.Resub = chat_client.onResub(async (_channel, user, subInfo) => {
    callback(await get('Resub', null, null, user, { subscribe: { user, info: subInfo } }));
  });

  // Fires when a user gifts rewards during a special event.
  chat_listeners.RewardGift = chat_client.onRewardGift(async (_channel, user, rewardGiftInfo, msg) => {
    callback(await get('RewardGift', msg, null, user, { reward: { user, info: rewardGiftInfo } }));
  });

  // Fires when a user performs a "ritual" in a channel (new user).
  chat_listeners.Ritual = chat_client.onRitual(async (_channel, user, ritualInfo, msg) => {
    callback(await get('Ritual', msg, null, user, { ritual: { user, info: ritualInfo } }));
  });

  // Fires when slow mode is toggled in a channel.
  chat_listeners.Slow = chat_client.onSlow(async (_channel, enabled, delay) => {
    callback(await get('Slow', null, null, null, { slow: { enabled, delay } }));
  });

  // Fires when a user pays forward a subscription that was gifted to them to a specific user.
  chat_listeners.StandardPayForward = chat_client.onStandardPayForward(async (_channel, user, subInfo, msg) => {
    callback(await get('StandardPayForward', msg, null, user, { subscribe: { user, info: subInfo } }));
  });

  // Fires when a user subscribes to a channel.
  chat_listeners.Sub = chat_client.onSub(async (_channel, user) => {
    callback(await get('Sub', null, null, user, { subscribe: { user, info: null } }));
  });

  // Fires when a user extends their subscription using a Sub Token.
  chat_listeners.SubExtend = chat_client.onSubExtend(async (_channel, user, subInfo, msg) => {
    callback(await get('SubExtend', msg, null, user, { subscribe: { user, info: subInfo } }));
  });

  // Fires when a user gifts a subscription to a channel to another user.
  chat_listeners.SubGift = chat_client.onSubGift(async (_channel, user, subInfo) => {
    callback(await get('SubGift', null, null, user, { subscribe: { user, info: subInfo } }));
  });

  // Fires when a user is timed out from a channel.
  chat_listeners.Timeout = chat_client.onTimeout(async (_channel, user, duration, msg) => {
    callback(await get('Timeout', msg, null, user, { timeout: { user, duration } }));
  });

  // Fires when sub only mode is toggled in a channel.
  chat_listeners.SubsOnly = chat_client.onSubsOnly(async (_channel, enabled) => {
    callback(await get('SubsOnly', null, null, null, { subscribe_only: { enabled } }));
  });

  // Fires when host mode is disabled in a channel.
  chat_listeners.Unhost = chat_client.onUnhost(async _channel => {
    callback(await get('Unhost', null, null, null));
  });

  // Fires when receiving a whisper from another user.
  chat_listeners.Whisper = chat_client.onWhisper(async (user, message, msg) => {
    callback(await get('Whisper', msg, message, user));
  });

  // Subscribes to events representing a stream going live.
  ws_listeners.StreamOnline = await ws_listener.subscribeToStreamOnlineEvents(channel.id, async e => {
    callback(await get('StreamOnline', null, null, null, {
      data: {
        id: e.id,
        type: e.type,
        startDate: e.startDate
      }
    }));
  });

  // Subscribes to events representing a stream going offline.
  ws_listeners.StreamOffline = await ws_listener.subscribeToStreamOfflineEvents(channel.id, async e => {
    callback(await get('StreamOffline', null, null, null));
  });

  // Subscribes to events representing a change in channel metadata, e.g. stream title or category.
  ws_listeners.ChannelUpdate = await ws_listener.subscribeToChannelUpdateEvents(channel.id, async e => {
    callback(await get('Update', null, null, null, {
      data: {
        streamTitle: e.streamTitle,
        streamLanguage: e.streamLanguage,
        categoryId: e.categoryId,
        categoryName: e.categoryName,
        isMature: e.isMature
      }
    }));
  });

  // Subscribes to events that represent a user following a channel.
  ws_listeners.ChannelFollow = await ws_listener.subscribeToChannelFollowEvents(channel.id, async e => {
    callback(await get('Follow', null, null, null, {
      user: {
        id: e.userId,
        type: '',
        name: e.userName,
        display: e.userDisplayName
      },
      data: {
        followDate: e.followDate
      }
    }));
  });

  // Subscribes to events that represent a user subscribing to a channel.
  ws_listeners.ChannelSubscription = await ws_listener.subscribeToChannelSubscriptionEvents(channel.id, async e => {
    callback(await get('Subscription', null, null, null, {
      user: {
        id: e.userId,
        type: '',
        name: e.userName,
        display: e.userDisplayName
      },
      data: {
        tier: e.tier,
        isGift: e.isGift
      }
    }));
  });

  // Subscribes to events that represent a user gifting a subscription to a channel to someone else.
  ws_listeners.ChannelSubscriptionGift = await ws_listener.subscribeToChannelSubscriptionGiftEvents(channel.id, async e => {
    callback(await get('SubscriptionGift', null, null, null, {
      user: {
        id: e.gifterId,
        type: '',
        name: e.gifterName,
        display: e.gifterDisplayName
      },
      data: {
        amount: e.amount,
        cumulativeAmount: e.cumulativeAmount,
        tier: e.tier,
        isAnonymous: e.isAnonymous,
      }
    }));
  });

  // Subscribes to events that represent a user's subscription to a channel being announced.
  ws_listeners.ChannelSubscriptionMessage = await ws_listener.subscribeToChannelSubscriptionMessageEvents(channel.id, async e => {
    callback(await get('SubscriptionMessage', null, null, null, {
      user: {
        id: e.userId,
        type: '',
        name: e.userName,
        display: e.userDisplayName
      },
      data: {
        tier: e.tier,
        cumulativeMonths: e.cumulativeMonths,
        streakMonths: e.streakMonths,
        durationMonths: e.durationMonths,
        messageText: e.messageText
      }
    }));
  });

  // Subscribes to events that represent a user's subscription to a channel ending.
  ws_listeners.ChannelSubscriptionEnd = await ws_listener.subscribeToChannelSubscriptionEndEvents(channel.id, async e => {
    callback(await get('SubscriptionEnd', null, null, null, {
      user: {
        id: e.userId,
        type: '',
        name: e.userName,
        display: e.userDisplayName
      },
      data: {
        tier: e.tier,
        isGift: e.isGift
      }
    }));
  });

  // Subscribes to events that represent a user cheering some bits.
  ws_listeners.ChannelCheer = await ws_listener.subscribeToChannelCheerEvents(channel.id, async e => {
    callback(await get('Cheer', null, null, null, {
      user: {
        id: e.userId,
        type: '',
        name: e.userName,
        display: e.userDisplayName
      },
      data: {
        isAnonymous: e.isAnonymous,
        message: e.message,
        bits: e.bits
      }
    }));
  });

  // Subscribes to events that represent a charity campaign starting in a channel.
  ws_listeners.ChannelCharityCampaignStart = await ws_listener.subscribeToChannelCharityCampaignStartEvents(channel.id, async e => {
    callback(await get('CharityCampaignStart', null, null, null, {
      data: {
        id: e.id,
        name: e.charityName,
        description: e.charityDescription,
        logo: e.charityLogo,
        website: e.charityWebsite,
        currentAmount: e.currentAmount,
        targetAmount: e.targetAmount,
        startDate: e.startDate
      }
    }));
  });

  // Subscribes to events that represent a charity campaign ending in a channel.
  ws_listeners.ChannelCharityCampaignStop = await ws_listener.subscribeToChannelCharityCampaignStopEvents(channel.id, async e => {
    callback(await get('CharityCampaignStop', null, null, null, {
      data: {
        id: e.id,
        name: e.charityName,
        description: e.charityDescription,
        logo: e.charityLogo,
        website: e.charityWebsite,
        currentAmount: e.currentAmount,
        targetAmount: e.targetAmount,
        endDate: e.endDate
      }
    }));
  });

  // Subscribes to events that represent a donation to a charity campaign in a channel.
  ws_listeners.ChannelCharityDonation = await ws_listener.subscribeToChannelCharityDonationEvents(channel.id, async e => {
    callback(await get('CharityDonation', null, null, null, {
      user: {
        id: e.donorId,
        type: '',
        name: e.donorName,
        display: e.donorDisplayName
      },
      data: {
        id: e.campaignId,
        name: e.charityName,
        description: e.charityDescription,
        logo: e.charityLogo,
        website: e.charityWebsite,
        amount: e.amount
      }
    }));
  });

  // Subscribes to events that represent progress in a charity campaign in a channel.
  ws_listeners.ChannelCharityCampaignProgress = await ws_listener.subscribeToChannelCharityCampaignProgressEvents(channel.id, async e => {
    callback(await get('CharityCampaignProgress', null, null, null, {
      data: {
        id: e.id,
        name: e.charityName,
        description: e.charityDescription,
        logo: e.charityLogo,
        website: e.charityWebsite,
        currentAmount: e.currentAmount,
        targetAmount: e.targetAmount
      }
    }));
  });

  // Subscribes to events that represent a user getting banned from a channel.
  ws_listeners.ChannelBan = await ws_listener.subscribeToChannelBanEvents(channel.id, async e => {
    callback(await get('Ban', null, null, null, {
      user: {
        id: e.userId,
        type: '',
        name: e.userName,
        display: e.userDisplayName
      },
      data: {
        moderator: {
          id: e.moderatorId,
          type: 'mod',
          name: e.moderatorName,
          display: e.moderatorDisplayName
        },
        reason: e.reason,
        startDate: e.startDate,
        endDate: e.endDate,
        isPermanent: e.isPermanent
      }
    }));
  });

  // Subscribes to events that represent a user getting unbanned from a channel.
  ws_listeners.ChannelUnban = await ws_listener.subscribeToChannelUnbanEvents(channel.id, async e => {
    callback(await get('Unban', null, null, null, {
      user: {
        id: e.userId,
        type: '',
        name: e.userName,
        display: e.userDisplayName
      },
      data: {
        moderator: {
          id: e.moderatorId,
          type: 'mod',
          name: e.moderatorName,
          display: e.moderatorDisplayName
        },
        reason: e.reason,
        startDate: e.startDate,
        endDate: e.endDate,
        isPermanent: e.isPermanent
      }
    }));
  });

  // Subscribes to events that represent a user getting moderator permissions in a channel.
  ws_listeners.ChannelModeratorAdd = await ws_listener.subscribeToChannelModeratorAddEvents(channel.id, async e => {
    callback(await get('ModeratorAdd', null, null, null, {
      user: {
        id: e.userId,
        type: 'mod',
        name: e.userName,
        display: e.userDisplayName
      }
    }));
  });

  // Subscribes to events that represent a user losing moderator permissions in a channel.
  ws_listeners.ChannelModeratorRemove = await ws_listener.subscribeToChannelModeratorRemoveEvents(channel.id, async e => {
    callback(await get('ModeratorRemove', null, null, null, {
      user: {
        id: e.userId,
        type: '',
        name: e.userName,
        display: e.userDisplayName
      }
    }));
  });

  // Subscribes to events that represent a broadcaster raiding another broadcaster.
  ws_listeners.ChannelRaidFrom = await ws_listener.subscribeToChannelRaidEventsFrom(channel.id, async e => {
    callback(await get('RaidFrom', null, null, null, {
      user: {
        id: e.raidingBroadcasterId,
        type: '',
        name: e.raidingBroadcasterName,
        display: e.raidingBroadcasterDisplayName
      },
      data: {
        viewers: e.viewers
      }
    }));
  });

  // Subscribes to events that represent a broadcaster being raided by another broadcaster.
  ws_listeners.ChannelRaidTo = await ws_listener.subscribeToChannelRaidEventsTo(channel.id, async e => {
    callback(await get('RaidTo', null, null, null, {
      user: {
        id: e.raidedBroadcasterId,
        type: '',
        name: e.raidedBroadcasterName,
        display: e.raidedBroadcasterDisplayName
      },
      data: {
        viewers: e.viewers
      }
    }));
  });

  // Subscribes to events that represent a Channel Points reward being added to a channel.
  ws_listeners.ChannelRewardAdd = await ws_listener.subscribeToChannelRewardAddEvents(channel.id, async e => {
    callback(await get('RewardAdd', null, null, null, {
      data: {
        id: e.id,
        isEnabled: e.isEnabled,
        isPaused: e.isPaused,
        isInStock: e.isInStock,
        title: e.title,
        cost: e.cost,
        prompt: e.prompt,
        inputRequired: e.userInputRequired,
        autoApproved: e.autoApproved,
        cooldownExpiryDate: e.cooldownExpiryDate,
        thisStream: e.redemptionsThisStream,
        maxPerStream: e.maxRedemptionsPerStream,
        maxPerUserPerStream: e.maxRedemptionsPerUserPerStream,
        cooldown: e.globalCooldown,
        color: e.backgroundColor
      }
    }));
  });

  // Subscribes to events that represent a Channel Points reward being updated.
  ws_listeners.ChannelRewardUpdate = await ws_listener.subscribeToChannelRewardUpdateEvents(channel.id, async e => {
    callback(await get('RewardUpdate', null, null, null, {
      data: {
        id: e.id,
        isEnabled: e.isEnabled,
        isPaused: e.isPaused,
        isInStock: e.isInStock,
        title: e.title,
        cost: e.cost,
        prompt: e.prompt,
        inputRequired: e.userInputRequired,
        autoApproved: e.autoApproved,
        cooldownExpiryDate: e.cooldownExpiryDate,
        thisStream: e.redemptionsThisStream,
        maxPerStream: e.maxRedemptionsPerStream,
        maxPerUserPerStream: e.maxRedemptionsPerUserPerStream,
        cooldown: e.globalCooldown,
        color: e.backgroundColor
      }
    }));
  });

  // Subscribes to events that represent a Channel Points reward being removed.
  ws_listeners.ChannelRewardRemove = await ws_listener.subscribeToChannelRewardRemoveEvents(channel.id, async e => {
    callback(await get('RewardRemove', null, null, null, {
      data: {
        id: e.id,
        isEnabled: e.isEnabled,
        isPaused: e.isPaused,
        isInStock: e.isInStock,
        title: e.title,
        cost: e.cost,
        prompt: e.prompt,
        inputRequired: e.userInputRequired,
        autoApproved: e.autoApproved,
        cooldownExpiryDate: e.cooldownExpiryDate,
        thisStream: e.redemptionsThisStream,
        maxPerStream: e.maxRedemptionsPerStream,
        maxPerUserPerStream: e.maxRedemptionsPerUserPerStream,
        cooldown: e.globalCooldown,
        color: e.backgroundColor
      }
    }));
  });

  // Subscribes to events that represents a Channel Points reward being redeemed.
  ws_listeners.ChannelRedemptionAdd = await ws_listener.subscribeToChannelRedemptionAddEvents(channel.id, async e => {
    callback(await get('RedemptionAdd', null, null, null, {
      user: {
        id: e.raidedBroadcasterId,
        type: '',
        name: e.raidedBroadcasterName,
        display: e.raidedBroadcasterDisplayName
      },
      data: {
        id: e.rewardId,
        title: e.rewardTitle,
        cost: e.rewardCost,
        prompt: e.rewardPrompt,
        input: e.input,
        status: e.status,
        redeemedAt: e.redeemedAt
      }
    }));
  });

  // Subscribes to events that represent a Channel Points reward being updated by a broadcaster.
  ws_listeners.ChannelRedemptionUpdate = await ws_listener.subscribeToChannelRedemptionUpdateEvents(channel.id, async e => {
    callback(await get('RedemptionUpdate', null, null, null, {
      user: {
        id: e.raidedBroadcasterId,
        type: '',
        name: e.raidedBroadcasterName,
        display: e.raidedBroadcasterDisplayName
      },
      data: {
        id: e.rewardId,
        title: e.rewardTitle,
        cost: e.rewardCost,
        prompt: e.rewardPrompt,
        input: e.input,
        status: e.status,
        redemptionDate: e.redemptionDate
      }
    }));
  });

  // Subscribes to events that represent a poll starting in a channel.
  ws_listeners.ChannelPollBegin = await ws_listener.subscribeToChannelPollBeginEvents(channel.id, async e => {
    callback(await get('PollBegin', null, null, null, {
      data: {
        id: e.id,
        title: e.title,
        choices: e.choices,
        isBitsVotingEnabled: e.isBitsVotingEnabled,
        bitsPerVote: e.bitsPerVote,
        isChannelPointsVotingEnabled: e.isChannelPointsVotingEnabled,
        channelPointsPerVote: e.channelPointsPerVote,
        startDate: e.startDate,
        endDate: e.endDate
      }
    }));
  });

  // Subscribes to events that represent a poll being voted on in a channel.
  ws_listeners.ChannelPollProgress = await ws_listener.subscribeToChannelPollProgressEvents(channel.id, async e => {
    callback(await get('PollProgress', null, null, null, {
      data: {
        id: e.id,
        title: e.title,
        choices: e.choices,
        isBitsVotingEnabled: e.isBitsVotingEnabled,
        bitsPerVote: e.bitsPerVote,
        isChannelPointsVotingEnabled: e.isChannelPointsVotingEnabled,
        channelPointsPerVote: e.channelPointsPerVote,
        startDate: e.startDate,
        endDate: e.endDate
      }
    }));
  });

  // Subscribes to events that represent a poll ending in a channel.
  ws_listeners.ChannelPollEnd = await ws_listener.subscribeToChannelPollEndEvents(channel.id, async e => {
    callback(await get('PollEnd', null, null, null, {
      data: {
        id: e.id,
        title: e.title,
        choices: e.choices,
        isBitsVotingEnabled: e.isBitsVotingEnabled,
        bitsPerVote: e.bitsPerVote,
        isChannelPointsVotingEnabled: e.isChannelPointsVotingEnabled,
        channelPointsPerVote: e.channelPointsPerVote,
        status: e.status,
        startDate: e.startDate,
        endDate: e.endDate
      }
    }));
  });

  // Subscribes to events that represent a prediction starting in a channel.
  ws_listeners.ChannelPredictionBegin = await ws_listener.subscribeToChannelPredictionBeginEvents(channel.id, async e => {
    callback(await get('PredictionBegin', null, null, null, {
      data: {
        id: e.id,
        title: e.title,
        outcomes: e.outcomes,
        startDate: e.startDate,
        lockDate: e.lockDate
      }
    }));
  });

  // Subscribes to events that represent a prediction being voted on in a channel.
  ws_listeners.ChannelPredictionProgress = await ws_listener.subscribeToChannelPredictionProgressEvents(channel.id, async e => {
    callback(await get('PredictionProgress', null, null, null, {
      data: {
        id: e.id,
        title: e.title,
        outcomes: e.outcomes,
        startDate: e.startDate,
        lockDate: e.lockDate
      }
    }));
  });

  // Subscribes to events that represent a prediction being locked in a channel.
  ws_listeners.ChannelPredictionLock = await ws_listener.subscribeToChannelPredictionLockEvents(channel.id, async e => {
    callback(await get('PredictionLock', null, null, null, {
      data: {
        id: e.id,
        title: e.title,
        outcomes: e.outcomes,
        startDate: e.startDate,
        lockDate: e.lockDate
      }
    }));
  });

  // Subscribes to events that represent a prediction ending in a channel.
  ws_listeners.ChannelPredictionEnd = await ws_listener.subscribeToChannelPredictionEndEvents(channel.id, async e => {
    callback(await get('PredictionEnd', null, null, null, {
      data: {
        id: e.id,
        title: e.title,
        outcomes: e.outcomes,
        startDate: e.startDate,
        endDate: e.endDate,
        status: e.status,
        winningOutcomeId: e.winningOutcomeId,
        winningOutcome: winningOutcome
      }
    }));
  });

  // Subscribes to events that represent a Goal beginning.
  ws_listeners.ChannelGoalBegin = await ws_listener.subscribeToChannelGoalBeginEvents(channel.id, async e => {
    callback(await get('GoalBegin', null, null, null, {
      data: {
        id: e.id,
        type: e.type,
        description: e.description,
        currentAmount: e.currentAmount,
        targetAmount: e.targetAmount,
        startDate: e.startDate
      }
    }));
  });

  // Subscribes to events that represent progress in a Goal in a channel.
  ws_listeners.ChannelGoalProgress = await ws_listener.subscribeToChannelGoalProgressEvents(channel.id, async e => {
    callback(await get('GoalProgress', null, null, null, {
      data: {
        id: e.id,
        type: e.type,
        description: e.description,
        currentAmount: e.currentAmount,
        targetAmount: e.targetAmount,
        startDate: e.startDate
      }
    }));
  });

  // Subscribes to events that represent the end of a Goal in a channel.
  ws_listeners.ChannelGoalEnd = await ws_listener.subscribeToChannelGoalEndEvents(channel.id, async e => {
    callback(await get('GoalEnd', null, null, null, {
      data: {
        id: e.id,
        type: e.type,
        description: e.description,
        isAchieved: e.isAchieved,
        currentAmount: e.currentAmount,
        targetAmount: e.targetAmount,
        startDate: e.startDate,
        endDate: e.endDate
      }
    }));
  });

  // Subscribes to events that represent a Hype Train beginning.
  ws_listeners.ChannelHypeTrainBegin = await ws_listener.subscribeToChannelHypeTrainBeginEvents(channel.id, async e => {
    callback(await get('HypeTrainBegin', null, null, null, {
      data: {
        id: e.id,
        level: e.level,
        total: e.total,
        progress: e.progress,
        goal: e.goal,
        topContributors: e.topContributors,
        lastContribution: e.lastContribution,
        startDate: e.startDate,
        expiryDate: e.expiryDate
      }
    }));
  });

  // Subscribes to events that represent progress in a Hype Train in a channel.
  ws_listeners.ChannelHypeTrainProgress = await ws_listener.subscribeToChannelHypeTrainProgressEvents(channel.id, async e => {
    callback(await get('HypeTrainProgress', null, null, null, {
      data: {
        id: e.id,
        level: e.level,
        total: e.total,
        progress: e.progress,
        goal: e.goal,
        topContributors: e.topContributors,
        lastContribution: e.lastContribution,
        startDate: e.startDate,
        expiryDate: e.expiryDate
      }
    }));
  });

  // Subscribes to events that represent the end of a Hype Train in a channel.
  ws_listeners.ChannelHypeTrainEnd = await ws_listener.subscribeToChannelHypeTrainEndEvents(channel.id, async e => {
    callback(await get('HypeTrainEnd', null, null, null, {
      data: {
        id: e.id,
        level: e.level,
        total: e.total,
        topContributors: e.topContributors,
        startDate: e.startDate,
        endDate: e.endDate,
        cooldownEndDate: e.cooldownEndDate
      }
    }));
  });

  // Subscribes to events that represent a user updating their account details.
  ws_listeners.UserUpdate = await ws_listener.subscribeToUserUpdateEvents(channel.id, async e => {
    callback(await get('UserUpdate', null, null, null, {
      user: {
        id: e.raidedBroadcasterId,
        type: '',
        name: e.raidedBroadcasterName,
        display: e.raidedBroadcasterDisplayName,
        description: e.userDescription,
        email: e.userEmail,
        emailIsVerified: e.userEmailIsVerified
      }
    }));
  });

  pubsub_listeners.Subscription = await pubsub_client.onSubscription(pubsub_userid, async message => {
    callback(await get('Subscription', null, message, null));
  });

  pubsub_listeners.Redemption = await pubsub_client.onRedemption(pubsub_userid, async msg => {
    callback(await get('Redemption', msg, msg.message, null));
  });

  await chat_client.connect();
  await ws_listener.start();
}

async function disconnect()
{
  for (const name in chat_listeners)
  {
    const listener = chat_listeners[name];
    if (listener)
      chat_client.removeListener(listener);
  }

  for (const name in ws_listeners)
  {
    const listener = ws_listeners[name];
    if (listener)
      listener.stop();
  }

  for (const name in pubsub_listeners)
  {
    const listener = pubsub_listeners[name];
    if (listener)
      listener.remove();
  }

  await ws_listener.stop();
  await chat_client.quit();

  pubsub_client = null;
  ws_listener = null;
  chat_client = null;
  api_client = null;
}

async function exec(type, name, args)
{
  let c = null;
  name = name[0].toLowerCase() + name.substr(1);

  try
  {
    if (type === 'API')
      c = api_client;
    else if (type === 'Chat')
    {
      c = chat_client;

      const prefix_channel = [
        'action',
        'addVip',
        'announce',
        'ban',
        'clear',
        'deleteMessage',
        'getMods',
        'getVips',
        'host',
        'mod',
        'purge',
        'raid',
        'removeVip',
        'runCommercial',
        'timeout',
        'unhostOutside',
        'unmod',
        'unraid',
        'say'
      ];

      if (prefix_channel.indexOf(name) >= 0)
        args.unshift(channel.name);
    }
    else if (type === 'PubSub')
      c = pubsub_client;
    else if (type === 'Methods' || type === 'Methods:convert')
      c = methods;

    if (c)
    {
      let result;
      if (args && args.length)
        result = await c[name](...args);
      else
        result = await c[name]();

      if (type.split(':').slice(-1)[0] === 'convert')
        return convert(result);
      return result;
    }
  }
  catch (e)
  {
    console.error('exec error:', e);
  }

  return null;
}

async function get(type, msg, message, user, merge)
{
  msg = (msg || {});
  channel.id = (channel.id || msg.channelId);
  const is_command = (message && message.length && message[0] === '!');

  let emotes = [];
  if (typeof(msg.parseEmotes) !== 'undefined')
  {
    for (const emote of await msg.parseEmotes())
    {
      const settings = {
        animationSettings: 'default',
        backgroundType: 'dark',
        size: '3.0'
      };

      const info = (emote.displayInfo ? await emote.displayInfo.getUrl(settings) : null);
      if (info)
      {
        emotes.push({
          name: emote.name,
          length: emote.length,
          position: emote.position,
          info: info
        });
      }
    }
  }

  return Object.assign((merge || {}), {
    id: msg.id,
    type: (is_command ? 'Command' : type),
    date: (msg.date ? msg.date : (msg.redemptionDate ? msg.redemptionDate : (new Date()).toISOString())),
    channel: { id: channel.id, name: channel.name },
    flags: (msg.userInfo
      ? {
        broadcaster: msg.userInfo.isBroadcaster,
        founder: msg.userInfo.isFounder,
        moderator: msg.userInfo.isMod,
        subscriber: msg.userInfo.isSubscriber,
        vip: msg.userInfo.isVip,
        follower: ((msg.userInfo && msg.userInfo.userId) ? !!(await methods.checkFollow(false, msg.userId)) : false)
      }
      : null),
    user: { // type: mod, global_mod, admin, staff
      id: (msg.userInfo ? msg.userInfo.userId : (msg.userId ? msg.userId : null)),
      type: (msg.userInfo ? msg.userInfo.userType : null),
      name: (msg.userInfo ? msg.userInfo.userName : (msg.userName ? msg.userName : (user || null))),
      display: (msg.userInfo ? msg.userInfo.displayName : (msg.userDisplayName ? msg.userDisplayName : null))
    },
    color: (msg.userInfo ? msg.userInfo.color : null),
    message: (is_command ? message.substr(1) : message),
    isCheer: msg.isCheer,
    isHighlight: msg.isHighlight,
    isRedemption: msg.isRedemption,
    badges: (msg.userInfo ? { list: msg.userInfo.badges, info: msg.userInfo.badgeInfo } : null),
    emotes: { list: emotes, offsets: msg.emoteOffsets },
    bits: msg.bits,
    reward: {
      id: msg.rewardId,
      status: msg.status,
      title: msg.rewardTitle,
      prompt: msg.rewardPrompt,
      cost: msg.rewardCost,
      queued: msg.rewardIsQueued,
      images: (msg.rewardImage || msg.defaultImage),
    }
  });
}

module.exports = {
  connect,
  disconnect,
  exec
};
