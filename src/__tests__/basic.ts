import { ApolloClient } from 'apollo-client';
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { print } from 'graphql';
import gql from 'graphql-tag';
import { Observable, FetchResult, ApolloLink } from 'apollo-link';
import { onError } from 'apollo-link-error';
import delay from 'delay';

import { createMessagingPorts, MockPort } from "../test-utils/createMessagingPorts";
import MockLink from "../test-utils/mockLink";

import { createWebExtensionMessagingExecutorListener, createWebExtensionsMessagingLink} from '..';
import { Operation } from 'apollo-link';
import { ServerError, ServerParseError } from 'apollo-link-http-common';

const observableOfWithDelay = <T>(value: T, delayMs = 1000): Observable<T> => new Observable<T>(observer => {
  const timer = setTimeout(() => {
    observer.next(value);
    observer.complete();
  }, delayMs);
  return (): void => clearTimeout(timer);
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
      cache: new InMemoryCache(),
      // from experience, if `queryDeduplication` is true,
      // `client.watchQuery` unsubscription will not be
      // properly passed down to the `link`
      queryDeduplication: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  it('should not leak listeners request after request', async () => {
    const requesterPortMessageListeners = requesterPort.listenerCount('message');
    const executorPortMessageListeners = executorPort.listenerCount('message');
    const requesterPortDisconnectListeners = requesterPort.listenerCount('disconnect');
    const executorPortDisconnectListeners = executorPort.listenerCount('disconnect');

    await client.query({ query });

    expect(requesterPort.listenerCount('message')).toEqual(requesterPortMessageListeners);
    expect(executorPort.listenerCount('message')).toEqual(executorPortMessageListeners);
    expect(requesterPort.listenerCount('disconnect')).toEqual(requesterPortDisconnectListeners);
    expect(executorPort.listenerCount('disconnect')).toEqual(executorPortDisconnectListeners);
  });

  it('should be able to stream a response', () => {
    requestHandler.mockImplementation(() => new Observable(observer => {
      const timer = setTimeout(() => {
        observer.next({ data: { foo: 'bar' } });
      }, 500);

      const timer2 = setTimeout((): void => {
        observer.next({ data: { foo: 'foo' } });
        observer.complete();
      }, 1000);
      return (): void => {
        clearTimeout(timer);
        clearTimeout(timer2);
      };
    }));

    return new Promise((resolve) => {
      const fooValues: string[] = [];
      client.watchQuery({ query })
        .subscribe(res => {
          fooValues.push(res.data.foo);
          if (fooValues.length == 2) {
            expect(fooValues[0]).toEqual('bar');
            expect(fooValues[1]).toEqual('foo');
            resolve();
          }
        });
    })
  });

  it('should forward executor\'s errors', async () => {
    const onNetworkError = jest.fn<unknown, [Error | ServerError | ServerParseError | undefined]>();

    client = new ApolloClient({
      link: ApolloLink.from([
        onError(({ networkError }) => {
          onNetworkError(networkError)
        }),
        createWebExtensionsMessagingLink(requesterPort),
      ]),
      cache: new InMemoryCache(),
      queryDeduplication: false,
    });
    requestHandler.mockImplementation(() => new Observable(observer => {
      observer.error(new Error('An error'));
    }));

    // execute but ignore errors
    try {
      await client.query({ query });
    } catch(e) {
      // do nothing
    }

    expect(onNetworkError.mock.calls[0][0]).toBeDefined();
    if (!onNetworkError.mock.calls[0][0]) throw new Error('no call');

    expect(onNetworkError.mock.calls[0][0].message).toEqual('An error');
  });

  it('should unsubscribe on executor when unsubsribe on request', async () => {
    const executorUnsubscribeSpy = jest.fn();

    requestHandler.mockImplementation(() => new Observable(() => {
      return (): void => {
        executorUnsubscribeSpy();
      }
    }));

    const subscription = client.watchQuery({ query })
      .subscribe(() => {/* do nothing*/});

    await delay(100);

    subscription.unsubscribe();

    expect(executorUnsubscribeSpy).toHaveBeenCalled();
  });

  it('should unsubscribe on executor when port is disconnected', async () => {
    const executorUnsubscribeSpy = jest.fn();

    requestHandler.mockImplementation(() => new Observable(() => {
      return (): void => {
        executorUnsubscribeSpy();
      }
    }));

    client.watchQuery({ query })
      .subscribe(() => {/* do nothing*/ });

    await delay(100);

    requesterPort.disconnect();

    expect(executorUnsubscribeSpy).toHaveBeenCalled();
  });
});
