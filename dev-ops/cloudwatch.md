## Cloudwatch Agent Files

| File                                                                                                                                                                                                                                                                                         | Linux Location                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| The control script that controls starting, stopping, and restarting the agent.                                                                                                                                                                                                               | /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ct<br />/usr/bin/amazon-cloudwatch-agent-ctl                                     |
| The log file the agent writes to. You might need to attach this when contacting AWS Support.                                                                                                                                                                                                 | /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log <br />/var/log/amazon/amazon-cloudwatch-agent/amazon-cloudwatch-agent.log   |
| Agent configuration validation file.                                                                                                                                                                                                                                                         | /opt/aws/amazon-cloudwatch-agent/logs/configuration-validation.log <br />/var/log/amazon/amazon-cloudwatch-agent/configuration-validation.log |
| The JSON file used to configure the agent immediately after the wizard creates it. <br />For more information, see Create the CloudWatch agent configuration file.                                                                                                                           | /opt/aws/amazon-cloudwatch-agent/bin/config.json                                                                                              |
| The JSON file used to configure the agent if this configuration file has been <br />downloaded from Parameter Store.                                                                                                                                                                         | /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <br />/etc/amazon/amazon-cloudwatch-agent/amazon-cloudwatch-agent.json      |
| The TOML file used to specify Region and credential information to be used by the agent,<br />overriding system defaults.                                                                                                                                                                    | /opt/aws/amazon-cloudwatch-agent/etc/common-config.toml <br /> /etc/amazon/amazon-cloudwatch-agent/common-config.toml                         |
| The TOML file that contains the converted contents of the JSON configuration file. <br />The amazon-cloudwatch-agent-ctl script generates this file. <br />Users should not directly modify this file. It can be useful for verifying that JSON to TOML translation was successful.          | /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.toml <br /> /etc/amazon/amazon-cloudwatch-agent/amazon-cloudwatch-agent.toml     |
| The YAML file that contains the converted contents of the JSON configuration file. <br />The amazon-cloudwatch-agent-ctl script generates this file. <br />You should not directly modify this file. This file can be useful for verifying that the JSON to YAML translation was successful. | /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.yaml <br /> /etc/amazon/amazon-cloudwatch-agent/amazon-cloudwatch-agent.yaml     |

## Executables

```
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ct
/usr/bin/amazon-cloudwatch-agent-ctl
```

## Configs

```
/opt/aws/amazon-cloudwatch-agent/bin/config.json
/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
/etc/amazon/amazon-cloudwatch-agent/amazon-cloudwatch-agent.json
/opt/aws/amazon-cloudwatch-agent/etc/common-config.toml
/etc/amazon/amazon-cloudwatch-agent/common-config.toml
/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.toml
/etc/amazon/amazon-cloudwatch-agent/amazon-cloudwatch-agent.toml
/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.yaml
/etc/amazon/amazon-cloudwatch-agent/amazon-cloudwatch-agent.yaml

/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
```

## Some other config that's being used.

``` log
2023/11/18 06:44:34 Reading json config file path: /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json ...
2023/11/18 06:44:34 Reading json config file path: /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.d/default ...
2023/11/18 06:44:34 I! Valid Json input schema.
2023/11/18 06:44:34 I! Detected runAsUser: root
2023/11/18 06:44:34 I! Changing ownership of [/opt/aws/amazon-cloudwatch-agent/logs /opt/aws/amazon-cloudwatch-agent/etc /opt/aws/amazon-cloudwatch-agent/var] to 0:0
2023-11-18T06:44:34Z I! Starting AmazonCloudWatchAgent CWAgent/1.300028.4b233 (go1.21.1; linux; amd64)
```

``` sh
vim /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.d/default
```

### Update used config

``` sh
aws ssm get-parameter --name AmazonCloudWatch-linux --region us-west-1 --query Parameter.Value --output text > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
```

## CloudWatch logs

```
/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log
/var/log/amazon/amazon-cloudwatch-agent/amazon-cloudwatch-agent.log
/var/log/amazon/amazon-cloudwatch-agent/configuration-validation.log
/opt/aws/amazon-cloudwatch-agent/logs/configuration-validation.log
```

## Tail logs 

```sh
tail -f /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log /var/log/amazon/amazon-cloudwatch-agent/amazon-cloudwatch-agent.log /var/log/amazon/amazon-cloudwatch-agent/configuration-validation.log /opt/aws/amazon-cloudwatch-agent/logs/configuration-validation.log
```

``` sh
status=$(sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status)
if [[ $status == *"running"* ]]; then
  echo "CloudWatch agent is running"
else
  echo "CloudWatch agent is not running"
  exit 1
fi

# Send a test log event
log_group_name="/aws/ec2/your-log-group"
log_stream_name="your-log-stream"
timestamp=$(date -u +%s%N | cut -b1-13)
message="This is a test log event"
sequence_token=$(aws logs describe-log-streams --log-group-name $log_group_name --log-stream-name-prefix $log_stream_name --query "logStreams[0].uploadSequenceToken" --output text)
aws logs put-log-events --log-group-name $log_group_name --log-stream-name $log_stream_name --log-events timestamp=$timestamp,message="$message" --sequence-token $sequence_token

echo "Test log event sent"
```

## It started working after I updated the /default file here:

```log
2023/11/18 18:09:58 Reading json config file path: /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json ...
2023/11/18 18:09:58 Reading json config file path: /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.d/default ...
```