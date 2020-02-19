import { ApolloLink, Observable, Operation, RequestHandler, NextLink, FetchResult } from 'apollo-link';

export default class MockLink extends ApolloLink {
  constructor(handleRequest: RequestHandler) {
    super();
    this.request = handleRequest;
  }

  public request(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _operation: Operation,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _forward?: NextLink,
  ): Observable<FetchResult> | null {
    throw Error('should be overridden');
  }
}
