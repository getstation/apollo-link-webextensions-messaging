import { ApolloLink  } from 'apollo-link';

import { createWebExtensionsMessagingLink, createWebExtensionMessagingExecutorListener } from "../../..";

const port = chrome.runtime.connect();
createWebExtensionsMessagingLink(port);

const link = new ApolloLink();
const listener = createWebExtensionMessagingExecutorListener({ link });
chrome.runtime.onConnect.addListener(listener);
