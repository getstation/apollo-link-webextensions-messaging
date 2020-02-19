import { ApolloClient } from 'apollo-client';
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { print } from 'graphql';
import gql from 'graphql-tag';
import { Observable, FetchResult } from 'apollo-link';

import { createMessagingPorts, MockPort } from "../test-utils/createMessagingPorts";
import MockLink from "../test-utils/mockLink";

import { createWebExtensionMessagingExecutorListener, createWebExtensionsMessagingLink} from '..';
import { Operation } from 'apollo-link';


const observableOfWithDelay = <T>(value: T, delayMs: number = 1000) => new Observable<T>(observer => {
  let timer = setTimeout(() => {
    observer.next(value);
    observer.complete();
  }, delayMs);
  return () => clearTimeout(timer);
});

let requesterPort: MockPort;
let executorPort: MockPort;

const query = gql`
  query BasicQuery {
    foo
  }
`;

beforeEach(() => {
  [requesterPort, executorPort] = createMessagingPorts();
});

describe('Basic end to end', () => {
  let client: ApolloClient<NormalizedCacheObject>;
  let requestHandler: jest.Mock<Observable<FetchResult>, [Operation]>;

  beforeEach(() => {
    client = new ApolloClient({
      link: createWebExtensionsMessagingLink(requesterPort),
      cache: new InMemoryCache()
    });
    requestHandler = jest.fn((_operation: Operation) => Observable.of({ data: { foo: 'bar' } }));

    createWebExtensionMessagingExecutorListener({
      link: new MockLink(requestHandler)
    })(executorPort);
  });

  it('should work', async () => {
    const { data } = await client.query({ query });
    expect(data).toEqual({ foo: 'bar' });
  });

  it('should have prefectly passed operation', async () => {
    await client.query({ query, variables: { arg1: 1 }});
    const op = requestHandler.mock.calls[0][0];

    expect(op.operationName).toEqual('BasicQuery');
    expect(op.variables).toEqual({ arg1: 1 });
    expect(print(op.query)).toEqual(`query BasicQuery {
  foo
}
`);

  });

  it('should contain the port as operation context', async () => {
    await client.query({ query });
    const op = requestHandler.mock.calls[0][0];
    const context = op.getContext();
    expect(context['port']).toEqual(executorPort);
  });

  it('should handle concurrent queries', async () => {
    requestHandler.mockImplementation(op => {
      if (op.operationName === 'BasicQuery') {
        return Observable.of({ data: { foo: 'bar' } });
      } else {
        return observableOfWithDelay({ data: { foo2: 'bar' } });
      }
    });

    const query2 = client.query({ query: gql`query NotBasicQuery { foo2 }`});
    const query1 = client.query({ query });

    const { data: data1 } = await query1;
    const { data: data2 } = await query2;

    expect(data1).toEqual({ foo: 'bar' });
    expect(data2).toEqual({ foo2: 'bar' });
  });

});

  // test streaming result

  // test error on executor

  // test request unsubsribe should unsubscribe on executor

  // test port disconect should usubscribe on executor

  // test executor completion should complete on requester