const net = require('dgram');

module.exports = class Proto
{
    constructor(app)
    {
        this.app = app
        this.proxy = {}             //[name] = proxy
        this.conns = {}
    }

    add_proxy(info, conn)
    {
        let exist = this.proxy[info.name]
        if (exist)
        {
            throw new Error(`proxy[${info.name}] already exist`)
        }

        exist = { ...info }

        this.proxy[info.name] = exist

        return exist
    }

    new_conn(proxy_name, conn_id)
    {
        let proxy = this.proxy[proxy_name]

        let conn = net.createSocket('udp4');

        conn.id = conn_id
        conn.count = 0
        conn.proxy = proxy
        conn.standby = []

        conn.bind(0)            //随机端口

        conn.on('listening', () =>
        {
            conn.connecting = true
            conn.connect(proxy.local_port, proxy.local_ip)
        });

        conn.on("connect", () =>
        {
            conn.connecting = false
            conn.connected = true

            for (let data of conn.standby)
            {
                conn.send(data)
            }

            conn.standby = null
        })

        conn.on('error', (err) =>
        {
            this.app.log(`proxy[${proxy.name}][udp][${proxy.local_port}]：make conn[${conn.id}] error:`, err);
        });

        conn.on('close', (has_error) =>
        {
            conn.closed = true

            if (!has_error)
            {
                this.app.log(`proxy[${proxy.name}][udp][${proxy.local_port}]:conn[${conn.id}] close`);
            }

            delete this.conns[conn.id]

            if (conn.force)
            {
                return
            }

            this.app.send("del_conn", proxy.type, conn.id)
        });

        conn.on("message", (data) =>
        {
            this.app.send("transport", proxy.type, conn.id, data)
        })

        this.conns[conn.id] = conn

        this.app.log(`proxy[${proxy.name}][udp][${proxy.local_port}]: make conn[${conn.id}]`);
    }

    /**
   * 客户端那边的连接断开，反映到这里
   */
    del_conn(conn_id)
    {
        let conn = this.conns[conn_id]

        if (conn == null)
        {
            this.app.log(`proxy[unknown][udp][unknown]:del a non-existent conn[${conn_id}]`);
            return
        }

        conn.force = true
        conn.close()

        let proxy = conn.proxy

        this.app.log(`proxy[${proxy.name}][${proxy.type}][${proxy.local_port}]: remote del conn[${conn.id}]`);
    }

    /**
     * 发给用户
     */
    send_proxy(conn_id, data)
    {
        let conn = this.conns[conn_id]

        if (conn == null)
        {
            this.app.log(`proxy[unknown][udp][unknown]:send proxy to a non-existent conn[${conn_id}]`);

            return
        }

        conn.count++

        if (conn.standby)
        {
            conn.standby.push(data)
        }
        else
        {
            conn.send(data)
        }

        if (conn.count % 1000 == 0)
        {
            let proxy = conn.proxy

            this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:conn[${conn.id}] send packet count:${conn.count}`)
        }
    }

    /**
     * 服务端断开
     */
    lost()
    {
        for (let conn_id in this.conns)
        {
            let conn = this.conns[conn_id]

            conn.force = true
            conn.close()
        }

        this.conns = {}
    }
}