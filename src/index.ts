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
} from './rpcs';
import { MessagingPort } from './types';

type CreateWebExtensionMessagingExecutorListenerOptions = {
  link: ApolloLink;
};
/**
 * 
 * @param param0 
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
        // todo: unsubscribe
        // todo: unsubscribe on disconnect
        const unsubscribe = execute(link, request).subscribe({
          next: res => port.postMessage(operationResultRPC(operationId, res)),
          // todo error: 
          complete: () => port.postMessage(operationCompleteRPC(operationId)),
        })
      }
    })
  };
}

type PortOrPortFn<T extends MessagingPort> = T | ((operation: GraphQLRequest) => T);

/**
 * 
 */
export function createWebExtensionsMessagingLink<T extends MessagingPort>(portFn: PortOrPortFn<T>): ApolloLink {
  return new ApolloLink((operation) => {
    const port = typeof portFn === 'function' ? portFn(operation) : portFn;
    const operationId = operation.toKey();

    return new Observable(observer => {
      port.postMessage(operationRequestRPC(operationId, operation));

      const onMessageListener = (message: Record<string, unknown>): void => {
        if (isOperationResultRPC(message, operationId)) {
          observer.next(message.params.result);
        }
        if (isOperationCompleteRPC(message, operationId)){
          observer.complete();
        }
      };

      // todo: on error
      port.onMessage.addListener(onMessageListener);

      return (): void => {
        port.postMessage(operationUnsubscribeRPC(operationId));
        port.onMessage.removeListener(onMessageListener);
      };
    });
  })
}
