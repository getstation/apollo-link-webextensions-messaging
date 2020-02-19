import { ApolloLink, Observable, Operation, RequestHandler, NextLink, FetchResult } from 'apollo-link';

export default class MockLink extends ApolloLink {
  constructor(handleRequest: RequestHandler = () => null) {
    super();
    this.request = handleRequest;
  }

  public request(
    _operation: Operation,
    _forward?: NextLink,
  ): Observable<FetchResult> | null {
    throw Error('should be overridden');
  }
}
