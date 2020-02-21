import { ApolloLink } from 'apollo-link';

import { createWebExtensionsMessagingLink, createWebExtensionMessagingExecutorListener } from "../..";

const port = browser.runtime.connect();
createWebExtensionsMessagingLink(port);

const link = new ApolloLink();
const listener = createWebExtensionMessagingExecutorListener({ link });
browser.runtime.onConnect.addListener(listener);
