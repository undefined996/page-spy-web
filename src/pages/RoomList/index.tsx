import { getSpyRoom } from '@/apis';
import {
  AllBrowserTypes,
  AllMPTypes,
  ClientInfo,
  OS_CONFIG,
  getBrowserLogo,
  getBrowserName,
  parseUserAgent,
} from '@/utils/brand';
import { useEventListener, useMount, useRequest, useThrottleFn } from 'ahooks';
import {
  Typography,
  Row,
  Col,
  message,
  Empty,
  Button,
  Input,
  Form,
  Select,
  Space,
  Layout,
  Skeleton,
} from 'antd';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import './index.less';
import { ClearOutlined, SearchOutlined } from '@ant-design/icons';
import { RoomCard } from './RoomCard';
import { useRoomListStore } from '@/store/room-list';
import { useShallow } from 'zustand/react/shallow';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
  FixedSizeList,
  ListChildComponentProps,
  ReactElementType,
  areEqual,
} from 'react-window';
import { LoadingFallback } from '@/components/LoadingFallback';

const { Title } = Typography;
const { Option } = Select;
const { Sider, Content } = Layout;

// 按搜索条件过滤房间
const filterConnections = (
  data: (I.SpyRoom & ClientInfo)[],
  condition: Record<'title' | 'address' | 'os' | 'browser', string>,
) => {
  const { title = '', address = '', os = '', browser = '' } = condition;
  const lowerCaseTitle = String(title).trim().toLowerCase();
  return data
    .filter(({ tags }) => {
      return String(tags.title).toLowerCase().includes(lowerCaseTitle);
    })
    .filter((i) => i.address.slice(0, 4).includes(address || ''))
    .filter(({ os: itemOs, browser: itemBrowser }) => {
      return (
        (!os || itemOs.type === os) &&
        (!browser || itemBrowser.type.includes(browser))
      );
    });
};

// 虚拟列表外层容器
const ContentContainer = forwardRef<HTMLDivElement, any>(
  ({ style, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        style={{
          ...style,
          height: `${parseFloat(style.height) + 24 * 2}px`,
        }}
        {...rest}
      />
    );
  },
) as ReactElementType;

// 每一行的房间
const RowRooms = memo(
  ({ index, style, data }: ListChildComponentProps<I.SpyRoom[][]>) => {
    const [columnCount] = useRoomListStore(
      useShallow((state) => [state.columnCount]),
    );
    const [isLoading, setIsLoading] = useState(true);
    useMount(() => {
      setIsLoading(false);
    });

    return (
      <div
        style={{ ...style, top: Number(style.top) + 24, paddingInline: 24 }}
        data-index={index}
      >
        {isLoading ? (
          <Skeleton active />
        ) : (
          <Row gutter={24}>
            {data[index].map((room) => {
              return (
                <Col span={24 / columnCount} key={room.address}>
                  <RoomCard key={room.address} room={room} />
                </Col>
              );
            })}
          </Row>
        )}
      </div>
    );
  },
  areEqual,
);

export const RoomList = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const [conditions, setConditions] = useState({
    title: '',
    address: '',
    os: '',
    browser: '',
  });
  const [rowCount, roomList, updateRoomList, setColumnCount] = useRoomListStore(
    useShallow((state) => [
      state.rowCount,
      state.roomList,
      state.updateRoomList,
      state.setColumnCount,
    ]),
  );
  const updateLayout = useThrottleFn(
    () => {
      const { innerWidth } = window;
      let span = 6;
      if (innerWidth < 700) {
        span = 1;
      } else if (innerWidth < 800) {
        span = 2;
      } else if (innerWidth < 1200) {
        span = 3;
      } else if (innerWidth < 1600) {
        span = 4;
      }
      setColumnCount(span);
      updateRoomList(connectionList);
    },
    { wait: 500 },
  );
  useEffect(() => {
    updateLayout.run();
    return updateLayout.cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEventListener('resize', updateLayout.run);

  const {
    data: connectionList = [],
    error,
    loading,
    runAsync: requestConnections,
  } = useRequest(
    async (group = '') => {
      const res = await getSpyRoom(group);
      return (res.data || []).map((conn) => {
        const { os, browser, framework } = parseUserAgent(conn.name);
        return {
          ...conn,
          os,
          browser,
          framework,
        };
      });
    },
    {
      pollingInterval: 10 * 1000,
      pollingWhenHidden: false,
      pollingErrorRetryCount: 0,
      onSuccess(data) {
        updateRoomList(filterConnections(data, conditions));
      },
      onError(e) {
        message.error(e.message);
      },
    },
  );

  const BrowserOptions = useMemo(() => {
    return AllBrowserTypes.filter((browser) => {
      return connectionList?.some(
        (conn) => conn.browser.type.toLocaleLowerCase() === browser,
      );
    }).map((name) => {
      return {
        name,
        label: getBrowserName(name),
        logo: getBrowserLogo(name),
      };
    });
  }, [connectionList]);

  const MPTypeOptions = useMemo(() => {
    return AllMPTypes.filter((mp) => {
      return connectionList?.some((conn) => conn.browser.type === mp);
    }).map((name) => {
      return {
        name,
        label: getBrowserName(name),
        logo: getBrowserLogo(name),
      };
    });
  }, [connectionList]);

  const onFormFinish = useCallback(
    async (value: any) => {
      try {
        setConditions((state) => ({
          ...state,
          ...value,
        }));
        await requestConnections(value.project);
      } catch (e: any) {
        message.error(e.message);
      }
    },
    [requestConnections],
  );

  const mainContent = useMemo(() => {
    if (loading) {
      return <LoadingFallback />;
    }
    if (error || roomList.length === 0)
      return (
        <Empty
          style={{
            marginTop: 60,
          }}
        />
      );

    return (
      <AutoSizer>
        {({ width, height }) => {
          return (
            <FixedSizeList
              width={width}
              height={height}
              innerElementType={ContentContainer}
              useIsScrolling
              itemCount={rowCount}
              itemData={roomList}
              itemSize={230}
              itemKey={(index, data) => {
                return data[index].map((i) => i.address).join(',');
              }}
            >
              {RowRooms as any}
            </FixedSizeList>
          );
        }}
      </AutoSizer>
    );
    // loading 无需添加到 deps，只有第一次显示 loading
  }, [error, roomList, rowCount]);

  return (
    <Layout style={{ height: '100%' }} className="room-list">
      <Sider width={350} theme="light" style={{ padding: 24 }}>
        <Title level={3} style={{ marginBottom: 32 }}>
          {t('common.connections')}
        </Title>
        <Form layout="vertical" form={form} onFinish={onFormFinish}>
          <Form.Item label={t('common.device-id')} name="address">
            <Input placeholder={t('common.device-id')!} allowClear />
          </Form.Item>
          <Form.Item label={t('common.project')} name="project">
            <Input placeholder={t('common.project')!} allowClear />
          </Form.Item>
          <Form.Item label={t('common.title')} name="title">
            <Input placeholder={t('common.title')!} allowClear />
          </Form.Item>
          <Form.Item label={t('common.os')} name="os">
            <Select placeholder={t('connections.select-os')} allowClear>
              {Object.entries(OS_CONFIG).map(([name, conf]) => {
                return (
                  <Option value={name} key={name}>
                    <div className="flex-between">
                      <span>{conf.label}</span>
                      <img src={conf.logo} height="20" alt="" />
                    </div>
                  </Option>
                );
              })}
            </Select>
          </Form.Item>
          <Form.Item label={t('common.browser')} name="browser">
            <Select
              listHeight={500}
              placeholder={t('connections.select-browser')}
              allowClear
            >
              {!!BrowserOptions.length && (
                <Select.OptGroup label="Web" key="web">
                  {BrowserOptions.map(({ name, logo, label }) => {
                    return (
                      <Option key={name} value={name}>
                        <div className="flex-between">
                          <span>{label}</span>
                          <img src={logo} width="20" height="20" alt="" />
                        </div>
                      </Option>
                    );
                  })}
                </Select.OptGroup>
              )}

              {!!MPTypeOptions.length && (
                <Select.OptGroup
                  label={t('common.miniprogram')}
                  key="miniprogram"
                >
                  {MPTypeOptions.map(({ name, logo, label }) => {
                    return (
                      <Option key={name} value={name}>
                        <div className="flex-between">
                          <span>{label}</span>
                          <img src={logo} width="20" height="20" alt="" />
                        </div>
                      </Option>
                    );
                  })}
                </Select.OptGroup>
              )}
            </Select>
          </Form.Item>
          <Row justify="end">
            <Col>
              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SearchOutlined />}
                  >
                    {t('common.search')}
                  </Button>
                  <Button
                    type="default"
                    icon={<ClearOutlined />}
                    onClick={() => {
                      form.resetFields();
                      form.submit();
                    }}
                  >
                    {t('common.reset')}
                  </Button>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Sider>
      <Content>{mainContent}</Content>
    </Layout>
  );
};
