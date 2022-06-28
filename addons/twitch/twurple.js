const	{ ApiClient } = require('@twurple/api'),
		{ ChatClient } = require('@twurple/chat'),
		{ PubSubClient } = require('@twurple/pubsub'),
		{ StaticAuthProvider } = require('@twurple/auth');

let		channel = { id: '', name: '' },
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
	raid: null,
	raidCancel: null,
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
		pubsub_client = null,
		pubsub_listeners = {
	Subscription: null,
	Redemption: null,
};


const methods = {
	isStreamLive: async userName => {
		const user = await api_client.users.getUserByName(userName || channel.name);
		if (!user)
			return false;

		return await user.getStream() !== null;
	},
	getAllClipsForBroadcaster: async userName => {
		const user = await api_client.users.getUserByName(userName || channel.name);
		if (!user)
			return false;

		return api_client.clips.getClipsForBroadcasterPaginated(user.id).getAll();
	},
	getAllRewards: async (userName, onlyManageable) => {
		const user = await api_client.users.getUserByName(userName || channel.name);
		if (!user)
			return false;

		return api_client.channelPoints.getCustomRewards(user.id, onlyManageable);
	},
	updateReward: async (userName, rewardId, isEnabled, isPaused) => { // Doesn't work if the reward was not created by the app
		const user = await api_client.users.getUserByName(userName || channel.name);
		if (!user)
			return false;

		//const reward = await api_client.channelPoints.getCustomRewardById(user.id, rewardId);
		//if (!reward)
		//	return false;

		const data = {};
		//const data = { title: reward.title, cost: reward.cost };
		if (typeof(isPaused) === 'boolean')
			data.isPaused = isPaused;
		if (typeof(isEnabled) === 'boolean')
			data.isEnabled = isEnabled;

		return api_client.channelPoints.updateCustomReward(user.id, rewardId, data);
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
		const name = obj.constructor.name;

		let keys = [];
		if (name == 'HelixCustomReward')
			keys = ['autoFulfill', 'backgroundColor', 'broadcasterDisplayName', 'broadcasterId', 'broadcasterName', 'cooldownExpiryDate', 'cost', 'globalCooldown', 'id', 'isEnabled', 'isInStock', 'isPaused', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'prompt', 'redemptionsThisStream', 'title', 'userInputRequired'];

		items = {};
		for (const key of keys)
		{
			if (obj[key] !== 'undefined')
				items[key] = obj[key];
		}
	}
	else
		items = obj;

	return items;
}


async function connect(clientId, accessToken, channelName, callback)
{
	channel.id = '';
	channel.name = channelName;

	const auth_provider = new StaticAuthProvider(clientId, accessToken);

	api_client = new ApiClient({ authProvider: auth_provider });
	chat_client = new ChatClient({ authProvider: auth_provider, channels: [channel.name] });
	pubsub_client = new PubSubClient();

	const pubsub_userid = await pubsub_client.registerUserListener(auth_provider);

	// Fires when a user sends an action (/me) to a channel.
	chat_listeners.Action = chat_client.onAction(async (channel, user, message, msg) => {
		callback(await get('Action', msg, message, user));
	});

	// Fires when a user sends an announcement (/announce) to a channel.
	chat_listeners.Announcement = chat_client.onAnnouncement(async (channel, user, announcementInfo, msg) => {
		callback(await get('Announcement', msg, null, user, { announcement: { user, info: announcementInfo } }));
	});

	/*chat_listeners.AnyMessage = chat_client.onAnyMessage(msg => {
		callback(await get('Message', msg, null, null));
	});*/

	// Fires when authentication fails.
	chat_listeners.AuthenticationFailure = chat_client.onAuthenticationFailure(async (message, retryCount) => {
		console.log('AuthenticationFailure:', retryCount);
		callback(await get('AuthenticationFailure', null, message, null, { retry: retryCount }));
	});

	// Fires when a user is permanently banned from a channel.
	chat_listeners.Ban = chat_client.onBan(async (channel, user, msg) => {
		callback(await get('Ban', msg, null, user, { ban: user }));
	});

	// Fires when a user upgrades their bits badge in a channel.
	chat_listeners.BitsBadgeUpgrade = chat_client.onBitsBadgeUpgrade(async (channel, user, upgradeInfo, msg) => {
		//console.log('BitsBadgeUpgrade:', upgradeInfo);
		//callback(await get('BitsBadgeUpgrade', msg, null, user, { upgrade: { user, info: upgradeInfo } }));
	});

	// Fires when the chat of a channel is cleared.
	chat_listeners.ChatClear = chat_client.onChatClear(async (channel, msg) => {
		callback(await get('ChatClear', msg, null, null));
	});

	// Fires when a user pays forward a subscription that was gifted to them to the community.
	chat_listeners.CommunityPayForward = chat_client.onCommunityPayForward(async (channel, user, forwardInfo, msg) => {
		console.log('CommunityPayForward:', forwardInfo);
		callback(await get('CommunityPayForward', msg, null, user, { community: { forward: forwardInfo } }));
	});

	// Fires when a user gifts random subscriptions to the community of a channel.
	chat_listeners.CommunitySub = chat_client.onCommunitySub(async (channel, user, subInfo, msg) => {
		console.log('CommunitySub:', subInfo);
		callback(await get('CommunitySub', msg, null, user, { subscribe: { user, info: subInfo } }));
	});

	chat_listeners.Connect = chat_client.onConnect(async () => {
		callback(await get('Connect', null, null, null));
	});

	chat_listeners.Ctcp = chat_client.onCtcp(async (target, user, command, params, msg) => {
		console.log('Ctcp:', target, command, params);
		callback(await get('Ctcp', msg, command, user, { ctcp: { target, params } }));
	});

	chat_listeners.CtcpReply = chat_client.onCtcpReply(async (target, user, command, params, msg) => {
		console.log('CtcpReply:', target, command, params);
		callback(await get('CtcpReply', msg, command, user, { ctcp: { target, params } }));
	});

	chat_listeners.Disconnect = chat_client.onDisconnect(async (manually, reason) => {
		console.log('Disconnect:', manually, reason);
		callback(await get('Disconnect', null, null, null, { reason, manually }));
	});

	// Fires when emote-only mode is toggled in a channel.
	chat_listeners.EmoteOnly = chat_client.onEmoteOnly(async (channel, enabled) => {
		callback(await get('EmoteOnly', null, null, null, { emote_only: { enabled } }));
	});

	// Fires when followers-only mode is toggled in a channel.
	chat_listeners.FollowersOnly = chat_client.onFollowersOnly(async (channel, enabled, delay) => {
		callback(await get('FollowersOnly', msg, message, user, { follower_only: { enabled, delay } }));
	});

	// Fires when a user upgrades their gift subscription to a paid subscription in a channel.
	chat_listeners.GiftPaidUpgrade = chat_client.onGiftPaidUpgrade(async (channel, user, subInfo, msg) => {
		callback(await get('GiftPaidUpgrade', msg, null, user, { subscribe: { user, info: subInfo } }));
	});

	// Fires when a channel hosts another channel.
	chat_listeners.Host = chat_client.onHost(async (channel, target, viewers) => {
		callback(await get('Host', null, null, null, { host: { channel: target, viewers } }));
	});

	// Fires when a channel you're logged in as its owner is being hosted by another channel.
	chat_listeners.Hosted = chat_client.onHosted(async (channel, byChannel, auto, viewers) => {
		callback(await get('Hosted', msg, message, byChannel, { host: { channel: byChannel, viewers, auto } }));
	});

	// Fires when Twitch tells you the number of hosts you have remaining in the next half hour for the channel for which you're logged in as owner after hosting a channel.
	chat_listeners.HostsRemaining = chat_client.onHostsRemaining(async (channel, numberOfHosts) => {
		callback(await get('HostsRemaining', null, null, null, { host: { remaining: numberOfHosts } }));
	});

	// Fires when a user joins a channel.
	chat_listeners.Join = chat_client.onJoin(async (channel, user) => {
		callback(await get('Join', null, null, user));
	});

	// Fires when you fail to join a channel.
	chat_listeners.JoinFailure = chat_client.onJoinFailure(async (channel, reason) => {
		console.log('JoinFailure:', reason);
		callback(await get('JoinFailure', null, null, null, { reason }));
	});

	chat_listeners.Message = chat_client.onMessage(async (channel, user, message, msg) => {
		callback(await get('Message', msg, message, user));
	});

	// Fires when a message you tried to send gets rejected by the ratelimiter.
	chat_listeners.MessageFailed = chat_client.onMessageFailed(async (channel, reason) => {
		callback(await get('MessageFailed', null, null, null, { reason }));
	});

	// Fires when a message you tried to send gets rejected by the ratelimiter.
	chat_listeners.MessageRatelimit = chat_client.onMessageRatelimit(async (channel, message) => {
		callback(await get('MessageRatelimit', null, message, null));
	});

	// Fires when a single message is removed from a channel.
	chat_listeners.MessageRemove = chat_client.onMessageRemove(async (channel, messageId, msg) => {
		callback(await get('MessageRemove', msg, null, null));
	});

	chat_listeners.NickChange = chat_client.onNickChange(async (oldNick, newNick, msg) => {
		callback(await get('NickChange', msg, null, newNick, { user: { old: oldNick } }));
	});

	// Fires when you tried to execute a command you don't have sufficient permission for.
	chat_listeners.NoPermission = chat_client.onNoPermission(async (channel, message) => {
		callback(await get('NoPermission', null, message, null));
	});

	// Sent to indicate the outcome of an action like banning a user (eg. /emoteonly, /subscribers, /ban or /host).
	chat_listeners.Notice = chat_client.onNotice(async (target, user, message, msg) => {
		console.log('Notice:', target);
		callback(await get('Notice', msg, message, user, { notice: { user, target } }));
	});

	// Fires when a user leaves ("parts") a channel.
	chat_listeners.Part = chat_client.onPart(async (channel, user) => {
		callback(await get('Part', null, null, user));
	});

	chat_listeners.PasswordError = chat_client.onPasswordError(async error => {
		console.log('PasswordError:', error);
		callback(await get('PasswordError', null, null, null, { error }));
	});

	// Fires when a user gifts a Twitch Prime benefit to the channel.
	chat_listeners.PrimeCommunityGift = chat_client.onPrimeCommunityGift(async (channel, user, subInfo, msg) => {
		callback(await get('PrimeCommunityGift', msg, null, user));
	});

	// Fires when a user upgrades their Prime subscription to a paid subscription in a channel.
	chat_listeners.PrimePaidUpgrade = chat_client.onPrimePaidUpgrade(async (channel, user, subInfo, msg) => {
		callback(await get('PrimePaidUpgrade', msg, null, user));
	});

	// Fires when R9K mode is toggled in a channel (UniqueChat).
	chat_listeners.R9k = chat_client.onR9k(async (channel, enabled) => {
		callback(await get('R9k', null, null, null, { r9k: enabled }));
	});

	// Fires when a user raids a channel.
	chat_listeners.Raid = chat_client.onRaid(async (channel, user, raidInfo, msg) => {
		callback(await get('Raid', msg, null, user, { raid: { channel: user, info: raidInfo } }));
	});

	// Fires when a user cancels a raid.
	chat_listeners.RaidCancel = chat_client.onRaidCancel(async (channel, msg) => {
		callback(await get('RaidCancel', msg, null, null));
	});

	chat_listeners.Register = chat_client.onRegister(async () => {
		callback(await get('Register', null, null, null));
	});

	// Fires when a user resubscribes to a channel.
	chat_listeners.Resub = chat_client.onResub(async (channel, user, subInfo) => {
		callback(await get('Resub', null, null, user, { subscribe: { user, info: subInfo } }));
		//chat_client.say(channel, `Merci @${user} pour le réabonnement (${subInfo.months} mois)!`);
	});

	// Fires when a user gifts rewards during a special event.
	chat_listeners.RewardGift = chat_client.onRewardGift(async (channel, user, rewardGiftInfo, msg) => {
		callback(await get('RewardGift', msg, null, user, { reward: { user, info: rewardGiftInfo } }));
	});

	// Fires when a user performs a "ritual" in a channel (new user).
	chat_listeners.Ritual = chat_client.onRitual(async (channel, user, ritualInfo, msg) => {
		console.log('Ritual:', ritualInfo);
		callback(await get('Ritual', msg, null, user, { ritual: { user, info: ritualInfo } }));
	});

	// Fires when slow mode is toggled in a channel.
	chat_listeners.Slow = chat_client.onSlow(async (channel, enabled, delay) => {
		callback(await get('Slow', null, null, null, { slow: { enabled, delay } }));
	});

	// Fires when a user pays forward a subscription that was gifted to them to a specific user.
	chat_listeners.StandardPayForward = chat_client.onStandardPayForward(async (channel, user, subInfo, msg) => {
		callback(await get('StandardPayForward', msg, null, user, { subscribe: { user, info: subInfo } }));
	});

	// Fires when a user subscribes to a channel.
	chat_listeners.Sub = chat_client.onSub(async (channel, user) => {
		callback(await get('Sub', null, null, user, { subscribe: { user, info: subInfo } }));
		//chat_client.say(channel, `Merci @${user} pour l'abonnement!`);
	});

	// Fires when a user extends their subscription using a Sub Token.
	chat_listeners.SubExtend = chat_client.onSubExtend(async (channel, user, subInfo, msg) => {
		callback(await get('SubExtend', msg, null, user, { subscribe: { user, info: subInfo } }));
	});

	// Fires when a user gifts a subscription to a channel to another user.
	chat_listeners.SubGift = chat_client.onSubGift(async (channel, user, subInfo) => {
		callback(await get('SubGift', null, null, user, { subscribe: { user, info: subInfo } }));
		//chat_client.say(channel, `Merci @${subInfo.gifter} pour l'abonnement offert à @${user}!`);
	});

	// Fires when a user is timed out from a channel.
	chat_listeners.Timeout = chat_client.onTimeout(async (channel, user, duration, msg) => {
		callback(await get('Timeout', msg, null, user, { timeout: { user, duration } }));
	});

	// Fires when sub only mode is toggled in a channel.
	chat_listeners.SubsOnly = chat_client.onSubsOnly(async (channel, enabled) => {
		callback(await get('SubsOnly', null, null, null, { subscribe_only: { enabled } }));
	});

	// Fires when host mode is disabled in a channel.
	chat_listeners.Unhost = chat_client.onUnhost(async channel => {
		callback(await get('Unhost', null, null, null));
	});

	// Fires when receiving a whisper from another user.
	chat_listeners.Whisper = chat_client.onWhisper(async (user, message, msg) => {
		callback(await get('Whisper', msg, message, user));
	});

	pubsub_listeners.Subscription = await pubsub_client.onSubscription(pubsub_userid, async message => {
		callback(await get('Subscription', null, message, null));
	});

	pubsub_listeners.Redemption = await pubsub_client.onRedemption(pubsub_userid, async msg => {
		callback(await get('Redemption', msg, null, null));
	});

	await chat_client.connect();

	//for (const clip of await getAllClipsForBroadcaster(userId))
	//	console.log(clip.url);
}

async function disconnect()
{
	for (const name in chat_listeners)
	{
		const listener = chat_listeners[name];
		if (listener)
			chat_client.removeListener(listener);
	}

	for (const name in pubsub_listeners)
	{
		const listener = pubsub_listeners[name];
		if (listener)
			listener.remove();
	}

	await chat_client.quit();

	pubsub_client = null;
	chat_client = null;
	api_client = null;
}

async function exec(type, name, args)
{
	let c = null;
	name = name[0].toLowerCase() + name.substr(1);

	try
	{
		if (type == 'API')
			c = api_client;
		else if (type == 'Chat')
		{
			c = chat_client;

			const prefix_channel = [
				'action',
				'addVip',
				'announce',
				'ban',
				'clear',
				'deleteMessage',
				'disableEmoteOnly',
				'disableFollowersOnly',
				'disableSlow',
				'disableSubsOnly',
				'disableUniqueChat',
				'enableEmoteOnly',
				'enableFollowersOnly',
				'enableSlow',
				'enableSubsOnly',
				'enableUniqueChat',
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
		else if (type == 'PubSub')
			c = pubsub_client;
		else if (type == 'Methods' || type == 'Methods:convert')
			c = methods;

		if (c)
		{
			let result;
			if (args && args.length)
				result = await c[name](...args);
			else
				result = await c[name]();

			if (type.split(':').slice(-1)[0] == 'convert')
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
	const is_command = (message && message.length && message[0] == '!');

	// parseEmotesAndBits(cheermotes, cheermoteFormat)
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
		flags: (msg.userInfo ? {
			broadcaster: msg.userInfo.isBroadcaster,
			founder: msg.userInfo.isFounder,
			moderator: msg.userInfo.isMod,
			subscriber: msg.userInfo.isSubscriber,
			vip: msg.userInfo.isVip
		} : null),
		user: { // type: mod, global_mod, admin, staff
			id: (msg.userInfo ? msg.userInfo.userId : null),
			type: (msg.userInfo ? msg.userInfo.userType : null),
			name: (msg.userInfo ? msg.userInfo.userName : (user || null)),
			display: (msg.userInfo ? msg.userInfo.displayName : null)
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
}
