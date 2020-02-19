# apollo-link-webextensions-messaging

> Apollo link that, in a WebExtension, forwards GraphQL operations between processes

[![NPM Version][npm-image]][npm-url]


## Install

```bash
npm i -S apollo-link-webextensions-messaging
```

## Features
- Supports response streaming. Perfect to use with [`reactive-graphql`][reactive-graphql] and [`apollo-link-reactive-schema`][apollo-link-reactive-schema]
- Compatible with Chrome Extensions and Web Extensions APIs
- Independent of `Port` creation method: adaptable for cross-extension messaging or native messaging
- Messaging context passing: use messaging `Port` (and esp. `MessageSender`) in local GraphQL resolvers

## Usage

```ts
// ------------------
// in background page
import { createWebExtensionMessagingExecutorListener } from 'apollo-link-webextensions-messaging';
import { SchemaLink } from 'apollo-link-schema';
import schema from './path/to/your/schema';

// local schema execution
const link = new SchemaLink({
  schema,
  context: operation => ({
    // `createWebExtensionMessagingExecutorListener` will
    // add `port`, the `onConnect`'s `Port` as Operation's context
    // we extract the `MessageSender` into GQL's context so that
    // it can be used in resolvers
    sender: operation.getContext().port.sender,
  })
});

const listener = createWebExtensionMessagingExecutorListener({
  link,
});

chrome.runtime.onConnect.addListener(listener);


// ----------------
// in content script
import { createWebExtensionsMessagingLink } from 'apollo-link-webextensions-messaging';
import { ApolloClient } from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';

const port = chrome.runtime.connect();

const client = new ApolloClient({
  // can also be `createWebExtensionsMessagingLink((operation) => port)`
  link: createWebExtensionsMessagingLink(port)),
  cache: new InMemoryCache(),
  // from experience, if `queryDeduplication` is true,
  // `client.watchQuery` unsubscription will not be
  // properly passed down to the `link`
  queryDeduplication: false,
});

client.query(MY_QUERY);
```

## License

[MIT](http://mit-license.org)

[npm-image]: https://img.shields.io/npm/v/apollo-link-webextensions-messaging.svg
[npm-url]: https://npmjs.org/package/apollo-link-webextensions-messaging
[reactive-graphql]: https://github.com/mesosphere/reactive-graphql
[apollo-link-reactive-schema]: https://github.com/getstation/apollo-link-reactive-schema