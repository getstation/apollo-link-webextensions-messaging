import { ApolloLink, GraphQLRequest, execute, Observable } from 'apollo-link';
import { parse } from 'graphql';
import * as uniqid from 'uniqid';

import {
  operationRequestRPC,
  operationUnsubscribeRPC,
  operationResultRPC,
  operationCompleteRPC,
  isOperationResultRPC,
  isOperationCompleteRPC,
  isOperationRequestRPC,
  operationErrorRPC,
  isOperationErrorRPC,
  isOperationUnsubscribeRPC, parseRPCNotificationMessage, OperationRequestRPC,
} from './rpcs';
import { MessagingPort, Message } from './types';

type CreateWebExtensionMessagingExecutorListenerOptions = {
  /**
   * The Apollo link to execute the received GraphQL request upon.
   */
  link: ApolloLink;
};

/**
 * Create a [`onConnect`][onConnect] listener that'll execute received
 * GraphQL request against the given [Apollo Link `link`][apollo-link].
 *
 * Operations passed to link will get a `context` that has key `port`
 * with the requesting `Port`.
 *
 * [onConnect]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onConnect
 * [apollo-link]: https://www.apollographql.com/docs/link/
 */
export function createWebExtensionMessagingExecutorListener<T extends MessagingPort>(
  { link }: CreateWebExtensionMessagingExecutorListenerOptions
): ((port: T) => void) {
  return (port: T): void => {
    port.onMessage.addListener((message: Message) => {
      if (isOperationRequestRPC(message)) {
        const m = parseRPCNotificationMessage(message) as OperationRequestRPC;
        if (m === null) return;
        const { params } = m;
        const { operationId } = params;
        const request: GraphQLRequest = {
          operationName: params.operationName,
          variables: params.variables,
          query: parse(params.query),
          context: {
            ...params.context,
            // add port in context
            port,
          }
        };

        const operationOnMessageListener = (message: Message): void => {
          const m = parseRPCNotificationMessage(message);
          if (m === null) return;

          if (isOperationUnsubscribeRPC(m, operationId)) {
            close();
          }
        };
        port.onMessage.addListener(operationOnMessageListener);

        const portDisconnectListener = (): void => {
          close();
        };
        port.onDisconnect.addListener(portDisconnectListener);

        const close = (): void => {
          subscription.unsubscribe();
          port.onMessage.removeListener(operationOnMessageListener);
          port.onDisconnect.removeListener(portDisconnectListener);
        };

        const subscription = execute(link, request).subscribe({
          next: res => port.postMessage(operationResultRPC(operationId, res)),
          error: error => port.postMessage(operationErrorRPC(operationId, error)),
          complete: () => port.postMessage(operationCompleteRPC(operationId)),
        })
      }
    })
  };
}

type PortOrPortFn<T extends MessagingPort> = T | ((operation: GraphQLRequest) => T);

/**
 * Create an [Apollo Link][apollo-link] that'll transfer the GraphQL request
 * over the _Port_ `port`.
 *
 * [apollo-link]: https://www.apollographql.com/docs/link/
 */
export function createWebExtensionsMessagingLink<T extends MessagingPort>(
  /**
   * The `Port` or a function that should return a `Port`.
   */
  portFn: PortOrPortFn<T>
): ApolloLink {
  return new ApolloLink((operation) => {
    const port = typeof portFn === 'function' ? portFn(operation) : portFn;
    const operationId = uniqid(`${operation.operationName}-`);

    return new Observable(observer => {
      port.postMessage(operationRequestRPC(operationId, operation));

      const onMessageListener = (message: Message): void => {
        const m = parseRPCNotificationMessage(message);
        if (m === null) return;

        if (isOperationResultRPC(m, operationId)) {
          observer.next(m.params.result);
        }
        if (isOperationCompleteRPC(m, operationId)) {
          observer.complete();
        }
        if (isOperationErrorRPC(m, operationId)) {
          observer.error(new Error(m.params.errorMessage));
        }
      };

      port.onMessage.addListener(onMessageListener);

      return (): void => {
        /**
         * In some cases like remote disconnection, port cleaning
         * will be unavailable. We catch error theses errors and warn
         * instead of propagating errors
         */
        try {
          port.postMessage(operationUnsubscribeRPC(operationId));
          port.onMessage.removeListener(onMessageListener);
        } catch (e) {
          console.warn(e);
        }
      };
    });
  })
}
