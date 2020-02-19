import { ApolloLink, GraphQLRequest, execute, Observable } from 'apollo-link';
import { parse } from 'graphql';

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
  isOperationUnsubscribeRPC,
} from './rpcs';
import { MessagingPort } from './types';

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
    port.onMessage.addListener(message => {
      if (isOperationRequestRPC(message)) {
        const { params } = message;
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

        const operationOnMessageListener = (message: Record<string, unknown>): void => {
          if (isOperationUnsubscribeRPC(message, operationId)) {
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
    const operationId = operation.toKey();

    return new Observable(observer => {
      port.postMessage(operationRequestRPC(operationId, operation));

      const onMessageListener = (message: Record<string, unknown>): void => {
        if (isOperationResultRPC(message, operationId)) {
          observer.next(message.params.result);
        }
        if (isOperationCompleteRPC(message, operationId)) {
          observer.complete();
        }
        if (isOperationErrorRPC(message, operationId)) {
          observer.error(new Error(message.params.errorMessage));
        }
      };

      port.onMessage.addListener(onMessageListener);

      return (): void => {
        port.postMessage(operationUnsubscribeRPC(operationId));
        port.onMessage.removeListener(onMessageListener);
      };
    });
  })
}
