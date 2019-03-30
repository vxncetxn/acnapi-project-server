const dialogflow = require("dialogflow");
const axios = require("axios");
const sendgrid = require("@sendgrid/mail");

const fb = require("../firebase");

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

const credentials = {
  private_key: process.env.DIALOGFLOW_API_KEY,
  client_email: `acnapi-bot-service@${
    process.env.FIREBASE_PROJECT_ID
  }.iam.gserviceaccount.com`
};
const projectId = process.env.FIREBASE_PROJECT_ID; // find it in settings of your Dialogflow agent
languageCode = "en-US";

const sessionClient = new dialogflow.SessionsClient({ credentials });

let cache_id = [];
let cache_sess = [];

module.exports = app => {
  app.get("/", (req, res) => {
    res.send({ Hello: "Welcome to ACNAPI's Client Server!" });
  });

  app.get("/mail_trial", async (req, res) => {
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
    const msg = {
      to: "test-1ngnm@mail-tester.com",
      from: "Botty@acnapi.com",
      subject: "Magic Link for Your Ticket!",
      html: `This is some link: https://www.google.com/`
    };
    await sendgrid.send(msg);
    res.sendStatus(200);
  });

  app.post("/api/df_text_query", async (req, res) => {
    let value;
    let chatflowID;
    let sessionPath = null;

    if (req.body.fromReact) {
      value = req.body.text;
      chatflowID = req.body.chatflowID;
    } else {
      value = req.body.message.text;
      chatflowID = req.body.message.chat.id.toString();
    }

    console.log(cache_id);

    for (let i = 0; i < cache_id.length; i++) {
      if (cache_id[i] === chatflowID) {
        sessionPath = cache_sess[i];
        break;
      }
    }
    if (sessionPath === null) {
      cache_id.push(chatflowID);
      sessionPath = sessionClient.sessionPath(projectId, chatflowID);
      cache_sess.push(sessionPath);
    }

    const textQuery = async text => {
      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: text,
            languageCode: languageCode
          }
        }
      };
      const response = await sessionClient.detectIntent(request);
      return response;
    };

    console.log(sessionPath);

    let dfReply;
    if (value === "/start") {
      if (!req.body.fromReact) {
        await axios.post(
          `https://api.telegram.org/bot${
            process.env.TELEGRAM_API_KEY
          }/sendMessage`,
          {
            chat_id: chatflowID,
            text: `Hello ${req.body.message.chat.first_name ||
              req.body.message.chat.username ||
              "there"}!\n\nFeel free to ask me anything! You could also type '/help' for help using this bot or '/shortcuts' for some useful shortcuts!`,
            parse_mode: "Markdown"
          }
        );
        res.sendStatus(200);
        return;
      } else {
        dfReply = await textQuery(value);
      }
    } else if (value === "/help") {
      if (!req.body.fromReact) {
        await axios.post(
          `https://api.telegram.org/bot${
            process.env.TELEGRAM_API_KEY
          }/sendMessage`,
          {
            chat_id: chatflowID,
            text:
              "Hello, I am Botty from ACNAPI! Feel free to ask me any questions related to ACNAPI and our products, be it whether you are a prospective customer interested in finding out more about our products or an existing customer who needs help with them!\n\nType '/shortcuts' for a list of helpful shortcuts for you to find your way around here!",
            parse_mode: "Markdown"
          }
        );
        res.sendStatus(200);
        return;
      } else {
        dfReply = await textQuery(value);
      }
    } else if (value === "/shortcuts" || value === "/shortcut") {
      if (req.body.fromReact) {
        dfReply = await textQuery("I would like to see the shortcuts.");
      } else {
        dfReply = await textQuery("I need the Telegram-shortcuts.");
      }
    } else if (value === "/enquire") {
      dfReply = await textQuery(
        "I would like to find out more about a product."
      );
    } else if (value === "/support") {
      dfReply = await textQuery("I need help with a product.");
    } else if (value === "/contact") {
      dfReply = await textQuery("I would like to contact a sales rep.");
    } else if (value === "/ticket") {
      dfReply = await textQuery("I would like to submit a ticket.");
    } else {
      dfReply = await textQuery(value);
    }
    dfReply = dfReply[0].queryResult;

    let chatflow;
    const response = await fb.db.doc(`chatflow/${chatflowID}`).get();

    chatflow = {
      ...response.data(),
      id: response.id
    };

    if (chatflow.messages) {
      if (dfReply.fulfillmentText.includes("magic link")) {
        const submitTime = new Date();
        await fb.db.collection("updates").add({
          type: "client-create",
          userID: "none",
          requester: dfReply.parameters.fields.name.stringValue,
          subject: dfReply.parameters.fields.subject.stringValue,
          group: dfReply.parameters.fields.product.stringValue,
          content: dfReply.parameters.fields.content.stringValue,
          updatedTime: submitTime
        });
        const newTicketRes = await fb.db.collection("tickets").add({
          requester: dfReply.parameters.fields.name.stringValue,
          email: dfReply.parameters.fields.email.stringValue,
          subject: dfReply.parameters.fields.subject.stringValue,
          group: dfReply.parameters.fields.product.stringValue,
          content: dfReply.parameters.fields.content.stringValue,
          submitTime: submitTime,
          lastUpdatedTime: submitTime,
          status: "Unviewed"
        });

        sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
        const msg = {
          to: dfReply.parameters.fields.email.stringValue,
          from: "Botty@acnapi.com",
          subject: "Magic Link for Your Ticket!",
          html: `This is a placeholder email. You can view the status of your ticket at https://${
            process.env.FIREBASE_PROJECT_ID
          }.firebaseapp.com/placeholderform=${newTicketRes.id}`
        };
        await sendgrid.send(msg);
      }

      fb.db.doc(`chatflow/${chatflowID}`).update({
        messages: [
          ...chatflow.messages,
          {
            source: "user",
            content: value,
            submitTime: new Date()
          },
          ...dfReply.fulfillmentMessages.map(item => {
            return {
              source: "bot",
              content: item.text.text[0],
              submitTime: new Date()
            };
          })
        ]
      });
    } else {
      fb.db
        .collection("chatflow")
        .doc(chatflowID)
        .set({
          messages: [
            {
              source: "bot",
              content: "Hello! My name is Botty. How may I help you today?",
              submitTime: new Date()
            },
            {
              source: "bot",
              content: "For a list of shortcuts, type **'/shortcuts'**!",
              submitTime: new Date()
            },
            {
              source: "user",
              content: value,
              submitTime: new Date()
            },
            ...dfReply.fulfillmentMessages.map(item => {
              return {
                source: "bot",
                content: item.text.text[0],
                submitTime: new Date()
              };
            })
          ]
        });
    }

    if (!req.body.fromReact) {
      const telegramReplies = dfReply.fulfillmentMessages.map(item => {
        return item.text.text[0];
      });
      const start = async () => {
        await asyncForEach(telegramReplies, async reply => {
          await axios.post(
            `https://api.telegram.org/bot${
              process.env.TELEGRAM_API_KEY
            }/sendMessage`,
            {
              chat_id: chatflowID,
              text: reply,
              parse_mode: "Markdown"
            }
          );
        });
      };

      start();
    }

    res.sendStatus(200);
  });
};
