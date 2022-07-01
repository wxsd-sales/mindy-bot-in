require('dotenv').config();
var webex = require('webex/env');
let mainCard = require('./cards/main.json');
const fetch = require('node-fetch');

var botId;

function botSetup(){
  webex.people.get("me").then(function(person){
      console.log(person);
      botId = person.id;
      console.log(`Saving BotId:${botId}`);
  }).catch(function(reason) {
      console.error(reason);
      process.exit(1);
  });
}

function finalizeWebexMessage(payload, card){
  if(card !== undefined){
    payload.attachments = [{
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": card
    }];
  }
  return webex.messages.create(payload).catch((err) => {
    console.log(`error sending message: ${err}`);
    console.log(`payload sent: ${payload}`);
  })
}

function sendWebexMessageToPersonId(personId, message, card){
  let payload = { "toPersonId":personId, "markdown":message };
  return finalizeWebexMessage(payload, card);
}

function sendWebexMessage(roomId, message, card){
  let payload = { "roomId":roomId, "markdown":message };
  return finalizeWebexMessage(payload, card);
}

function removeMembership(membership){
  webex.memberships.remove(membership).catch(mexc => {
    console.log('membership remove error:');
    console.log(mexc);
  });
}

function validatePhoneNumber(inputNumber){
  phoneNumber = inputNumber.replace(/\D/g, '');
  if (phoneNumber.length == 10 || (phoneNumber.length == 11 && phoneNumber[0] == '1')) {
      if (phoneNumber.length == 10) {
          phoneNumber = "1" + phoneNumber;
      }
      return phoneNumber;
  } else {
      return null;
  }
}

function getRoomMeetingInfo(roomId){
  return fetch(`https://webexapis.com/v1/rooms/${roomId}/meetingInfo`, {
    headers: {'Authorization': `Bearer ${process.env.WEBEX_ACCESS_TOKEN}`}
  });
}

function getMeetingLinks(sipAddress){
  let payload = {
    "expire_hours":8, 
    "sip_target":sipAddress,
    "header_toggle": false,
    "auto_dial": true,
    //"background_url": "https://someimg.com/1234.jpg",
    //"meet_button_color":"00FF00",
    "version":2
  };

  return fetch(process.env.LINK_GENERATOR_URL+"/create_url", {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
  });
}

function smsMeetingLink(number, message){
  let payload = {"number":number, "url":message};

  return fetch(process.env.LINK_GENERATOR_URL+"/sms", {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
  });
}

function sendMeetingLink(guestUrl, smsMessage, validNumber, roomId, botMembership){
  try{
    smsMeetingLink(validNumber, smsMessage).then(resp => {
      sendWebexMessage(roomId, `Sent a meeting [link](${guestUrl}) to ${validNumber}`).then(function(message){
        console.log('sent message:');
        console.log(message);
        removeMembership(botMembership);
      });
    }).catch(smse => {
      console.log(`error sending sms link to ${validNumber}`);
      console.log(smse);
      sendWebexMessage(roomId, `An error occurred sending the meeting link to ${validNumber}`).then(function(message){
        console.log('sent message:');
        console.log(message);
        removeMembership(botMembership);
      });
    });
  } catch(e){
    console.log('error with returned meeting links from guest demo:');
    console.log(e);
    sendWebexMessage(roomId, `An error occurred formatting a meeting link, so nothing was sent to the SMS number.`).then(function(message){
      console.log('sent message:');
      console.log(message);
      removeMembership(botMembership);
    });
  }
}

/*
function sendHelpMessage(roomId, text){
  msg = `You said, "${text}."  \n`;
  msg += "I'll continue to echo your message, but if you type ```card```, I'll send you an adaptive card.";
  sendWebexMessage(roomId, msg);
}*/

function eventListener(){
  console.log('connected');
  webex.messages.listen().then(() => {
    console.log('listening to message events');
    webex.messages.on('created', (message) => {
      if(message.actorId != botId){
        console.log('message created event:');
        console.log(message);
        let roomId = message.data.roomId;
        let roomType = message.data.roomType;
        if(roomType == "group"){
          sendWebexMessage(roomId, "This bot can only be used in direct message spaces.");
        } else {
          sendWebexMessage(roomId, "SMS Meeting Invite - Adaptive Card ", mainCard);
        } 
      }//else, we do nothing when we see the bot's own message
    });
  })
  .catch((err) => {
    console.error(`error listening to messages: ${err}`);
  });

  webex.attachmentActions.listen().then(() => {
    console.log('listening to attachmentAction events');
    webex.attachmentActions.on('created', (attachmentAction) => {
      console.log('attachmentAction created event:');
      console.log(attachmentAction);
      let actorId = attachmentAction.actorId;
      let roomId = attachmentAction.data.roomId;
      let inputs = attachmentAction.data.inputs;
      if(inputs.number != ''){
        let validNumber = validatePhoneNumber(inputs.number);
        if(validNumber){
          sendWebexMessage(roomId, `Generating a new space and sending the meeting link to ${validNumber} now!`);
          let createRoom = {title: `Nurse Support - Follow up to ${validNumber}`};
          webex.rooms.create(createRoom).then(function(room){
            console.log('room:');
            console.log(room);
            webex.memberships.list({"personId": botId, "roomId": room.id}).then(function(memberships){
              console.log('botMembership:')
              console.log(memberships.items);
              let botMembership = memberships.items[0];
              webex.memberships.create({"roomId":room.id, "personId":actorId}).then(function(membership){
                getRoomMeetingInfo(room.id)
                .then(res => res.json())
                .then(json => {
                    console.log("Room Meeting Info:");
                    console.log(json);
                    getMeetingLinks(json.sipAddress).then(res => res.json())
                      .then(json => {
                        console.log("Meeting Links:");
                        console.log(json);
                        let guestUrl = json['urls']['Guest'][0];
                        guestUrl = guestUrl.replace('guest','hidden');
                        let smsMessage = `${membership.personDisplayName} has invited you to join a meeting: ${guestUrl}`;
                        sendMeetingLink(guestUrl, smsMessage, validNumber, room.id, botMembership);
                      }).catch( e => {
                        console.log('getMeetingLinks error:');
                        console.log(e);
                        sendWebexMessage(room.id, `An error occurred generating a meeting link, so nothing was sent to the SMS number.`);
                      });
                }).catch(ex => {
                  console.log('getRoomMeetingInfo error:');
                  console.log(ex);
                  sendWebexMessage(room.id, `An error occurred getting the room meeting info, so nothing was sent to the SMS number.`)
                });
              }).catch(exx => {
                console.log('memberships create for user error:');
                console.log(exx);
                sendWebexMessage(roomId, `An error occurred adding you to the newly created space, so nothing was sent to the SMS number.`);
              });
            }).catch(exce => {
              console.log('memberships list for botMembership error:');
              console.log(exce);
              sendWebexMessage(roomId, `An error occurred retrieving information for the newly created space, so nothing was sent to the SMS number.`);
            })
          }).catch(exc => {
            console.log('rooms create error:');
            console.log(exc);
            sendWebexMessage(roomId, `An error occurred creating a new space, so nothing was sent to the SMS number.`);
          });
          //webex.messages.remove(attachmentAction.data.messageId); //delete the card after the user submits successfully.
        } else {
          sendWebexMessage(roomId, `The phone number entered (${inputs.number}) is not in a valid format.`);
        }
      } else {
        sendWebexMessage(roomId, "Please enter an SMS enabled phone number and try again.");
      }
    });
  })
  .catch((err) => {
    console.error(`error listening to attachmentActions: ${err}`);
  });

  webex.memberships.listen().then(() => {
    console.log('listening to membership events');
    webex.memberships.on('created', (membership) => {
      console.log('membership created event:');
      console.log(membership);
      let roomType = membership.data.roomType;
      let roomId = membership.data.roomId;
      //Did someone other than the bot add the bot to a group space?
      if(membership.actorId != botId && membership.data.personId == botId && roomType == "group" && roomId != process.env.TEAM_ROOM_ID){
        webex.memberships.remove(membership.data.id)
        let msg = "You added me to a group space, but I removed myself because I am only intended to work in direct message spaces like this one.";
        sendWebexMessageToPersonId(membership.actorId, msg);
      }
    });
  })
  .catch((err) => {
    console.error(`error listening to messages: ${err}`);
  });
}

botSetup();
eventListener();
