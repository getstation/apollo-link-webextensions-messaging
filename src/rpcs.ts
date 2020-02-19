import { Operation } from 'apollo-link';
import { print, ExecutionResult, GraphQLError } from 'graphql';

export type RPCNotificationMessage<TParam> = {
  jsonrpc: '2.0';
  method: string;
  params: TParam;
};
export const isRPCNotificationMessage = <T>(message: Record<string, unknown>): message is RPCNotificationMessage<T> =>
  message.jsonrpc === '2.0';

const isRecord = (r: unknown): r is Record<string, unknown> => typeof r === 'object' && r !== null;

// requester -> executor
export type OperationRequestRPC = RPCNotificationMessage<{
  operationId: string;
  operationName: string;
  variables: Record<string, unknown>;
  query: string;
  context: Record<string, unknown>;
}>;
export const OPERATION_REQUEST_METHOD = 'operation-request';
export const operationRequestRPC = (operationId: string, operation: Operation): OperationRequestRPC => ({
  jsonrpc: '2.0',
  method: OPERATION_REQUEST_METHOD,
  params: {
    operationId,
    operationName: operation.operationName,
    variables: operation.variables,
    query: print(operation.query),
    context: operation.getContext(),
  }
});
export const isOperationRequestRPC = (message: Record<string, unknown>): message is OperationRequestRPC =>
  isRPCNotificationMessage(message) && (message.method === OPERATION_REQUEST_METHOD);

// executor -> requester
export interface SerializedExecutionResult {
  data?: object | null;
  errors?: readonly GraphQLError[];
}
export type OperationResultRPC = RPCNotificationMessage<{
  operationId: string;
  result: SerializedExecutionResult;
}>;
export const OPERATION_RESULT_METHOD = 'operation-result';
export const operationResultRPC = (operationId: string, result: ExecutionResult): OperationResultRPC => ({
  jsonrpc: '2.0',
  method: OPERATION_RESULT_METHOD,
  params: {
    operationId,
    result,
  }
});
export const isOperationResultRPC = (message: Record<string, unknown>, operationId: string): message is OperationResultRPC =>
  isRPCNotificationMessage(message) &&
  (message.method === OPERATION_RESULT_METHOD) &&
  (isRecord(message.params) && message.params.operationId === operationId);

// executor -> requester
export type OperationErrorRPC = RPCNotificationMessage<{
  operationId: string;
  errorMessage: string;
}>
export const OPERATION_ERROR_METHOD = 'operation-error';
export const operationErrorRPC = (operationId: string, errorValue: unknown): OperationErrorRPC => {
  let errorMessage = '<unknow error>';
  if (errorValue instanceof Error) {
    errorMessage = errorValue.message;
  }
  return {
    jsonrpc: '2.0',
    method: OPERATION_ERROR_METHOD,
    params: {
      operationId,
      errorMessage,
    }
  };
};
export const isOperationErrorRPC = (message: Record<string, unknown>, operationId: string): message is OperationErrorRPC =>
  isRPCNotificationMessage(message) &&
  (message.method === OPERATION_ERROR_METHOD) &&
  (isRecord(message.params) && message.params.operationId === operationId);


// executor -> requester
export type OperationCompleteRPC = RPCNotificationMessage<{ operationId: string }>;
export const OPERATION_COMPLETE_METHOD = 'operation-complete';
export const operationCompleteRPC = (operationId: string): OperationCompleteRPC => ({
  jsonrpc: '2.0',
  method: OPERATION_COMPLETE_METHOD,
  params: {
    operationId,
  }
});
export const isOperationCompleteRPC = (message: Record<string, unknown>, operationId: string): message is OperationCompleteRPC =>
  isRPCNotificationMessage(message) &&
  (message.method === OPERATION_COMPLETE_METHOD) &&
  (isRecord(message.params) && message.params.operationId === operationId);

// requester -> executor
export type OperationUnsubscribeRPC = RPCNotificationMessage<{
  operationId: string;
}>;
export const OPERATION_UNSUBSCRIBE_METHOD = 'operation-unsubscribe';
export const operationUnsubscribeRPC = (operationId: string): OperationUnsubscribeRPC => ({
  jsonrpc: '2.0',
  method: OPERATION_UNSUBSCRIBE_METHOD,
  params: {
    operationId,
  }
});
export const isOperationUnsubscribeRPC = (message: Record<string, unknown>, operationId: string): message is OperationUnsubscribeRPC =>
  isRPCNotificationMessage(message) &&
  (message.method === OPERATION_UNSUBSCRIBE_METHOD) &&
  (isRecord(message.params) && message.params.operationId === operationId);
