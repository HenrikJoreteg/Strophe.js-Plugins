/*global $ Strophe $pres $msg, $iq */
/* 
A simplified MUC plugin for Strophe. It uses jQuery to parse the XML so you don't
have to mess with XML at all to use it.

All you have to do to use it is listen for jQuery document events. All those
events are given the 'muc' namespace (http://docs.jquery.com/Namespaced_Events).

This plugin listens for: 
1. invitations
2. presence
3. messages
4. topics changes

It converts these the following rather self-explanatory events:
1. inviteReceived.muc
2. presenceReceived.muc
3. topicReceived.muc
4. messageReceived.muc

Example usage. In your app just listen for that event like so:
$(document).bind('inviteReceived.muc', function (e, invitation) {
    // the object contains anything useful you'd want to know from the xml.
    console.log('room:', invitation.room);
    console.log('reason:', invitation.reason);
    console.log('body:', invitation.body);
    console.log('from:', invitation.from);
});

It also provides the following methods:
1. join(room, nick, show) - join a muc
2. leave(room, nick) - leave a muc
3. message(room, nick, message) - send message duh!
4. setTopic(room, topic) - attempt to set the topic for the room
5. inviteUser(room, from, to, reason) - invite a user
 

*/
Strophe.addConnectionPlugin('muc', {
	// set connection and register handlers
	init: function (connection) {
		this.connection = connection;
		
		Strophe.addNamespace('MUC_OWNER', Strophe.NS.MUC + "#owner");
		Strophe.addNamespace('MUC_ADMIN', Strophe.NS.MUC + "#admin");
		Strophe.addNamespace('MUC_USER', Strophe.NS.MUC + "#user");
		
		// grab messages that have the MUC namespace
		// these could contain invites
		this.connection.addHandler(this.handleMucInvite.bind(this), Strophe.NS.MUC_USER, 'message');		
		
		// listen for muc messages
		this.connection.addHandler(this.handleMucMessage.bind(this), null, 'message', 'groupchat');
		
		// listen for muc presences
		this.connection.addHandler(this.handleMucPresence.bind(this), Strophe.NS.MUC_USER, 'presence');
	},
	
	// handle muc invitations
	handleMucInvite: function (message) {
	    var invite = $(message).find('x[xmlns="' + Strophe.NS.MUC_USER + '"] > invite'),
	        result;
	    
	    // check to see if this is a muc invite
	    if (invite.length) {
	        result = {
	            room: $(message).attr('from'),
	            reason: $(message).find('reason').text(),
	            body: $(message).find('body').text(),
	            from: $(message).find('invite').attr('from')
	        };
	        
	        $(document).trigger('inviteReceived.muc', result);
	    }
	    
	    return true;
	},
	
	// Takes muc messages and turn them into jQuery document events.
	// These can also contain room topic changes. So we look for those too.
	handleMucMessage: function (message) {
		var result,
		    mess = $(message),
		    topic = mess.find('subject');
		
		if (topic.length) {
		    topic.each(function () {
		        var result = {
		            topic: $(this).text(),
		            room: mess.attr('from').split('/')[0]
		        };
		        
                $(document).trigger('topicReceived.muc', result); 
		    });
		}
		
		if (mess.find('> body').text()) {
            result = {
                room: mess.attr('from').split('/')[0],
                nick: mess.attr('from').split('/')[1],
                body: mess.find('> body').text(),
                html_body: mess.find('html[xmlns="http://jabber.org/protocol/xhtml-im"] > body').html(),
                delay: mess.find('delay').attr('stamp') || null
            };
            
            $(document).trigger('messageReceived.muc', result);		
		}
			
		// return true so Strophe doesn't delete the handler stays
		return true;
	},
	
	// This takes a muc presence stanza and translates it to JS object
	handleMucPresence: function (presence) {
		var result,
		    pres = $(presence),
		    item;
		
		// try to get our x elem that contains affiliations/roles
		item = pres.find('x[xmlns="' + Strophe.NS.MUC_USER + '"] > item[affiliation][role]');
		
		result = {
		    room: pres.attr('from').split('/')[0],
		    nick: pres.attr('from').split('/')[1],
		    status: pres.attr('type') || 'available',
		    show: pres.find('show').text() || '',
		    role: item.attr('role'),
		    affiliation: item.attr('affiliation'),
		    jid: item.attr('jid') || ''
		};
		
		$(document).trigger('presenceReceived.muc', result);
		
		// return true so Strophe doesn't delete the handler stays
		return true;
	},
	
	// join a muc
	join: function (room, nick, show) {
		var room_nick, msg;
		
		room_nick = room + '/' + nick;		
		
		msg = $pres({
				from: this.connection.jid,
				to: room_nick
			});
		
		if (show) {
		    msg.c('show')
		        .t(show)
		        .up()
		        .c('x', {xmlns: Strophe.NS.MUC});
		}
		
		// send our room presence
		this.connection.send(msg);
	},
	
	// leave a muc
	leave: function (room, nick) {
		var presence = $pres({
				type: "unavailable",
				from: this.connection.jid,
				to: room
			})
			.c("x", {xmlns: Strophe.NS.MUC});
		
		this.connection.send(presence);
	},
	
	// send a message to a room
	message: function (room, nick, message) {
		var msgid, msg;
		
		msgid = this.connection.getUniqueId();
		msg = $msg({
				to: room,
				from: this.connection.jid.split('/')[0] + '/' + nick,
				type: "groupchat",
				id: msgid
			})
			.c("body")
			.t(message);

		this.connection.send(msg);
	},
	
	// attempt to set the topic in a room 
	setTopic: function (room, topic) {
		var msg = $msg({
				to: room,
				from: this.connection.jid,
				type: "groupchat"
			})
			.c("subject", {xmlns: "jabber:client"}).t(topic);
		this.connection.send(msg.tree());
	},
		
	// invite a user to a room
	inviteUser: function (room, from, to, reason) {
	    var invite = $msg({from: from, to: room})
	        .c('x', {xmlns: Strophe.NS.MUC_USER})
	        .c('invite', {to: to});
	        
	    if (reason) {
	        invite = invite
	            .c('reason')
	            .t(reason);
	    }
	    
	    this.connection.send(invite.tree());
	}
});