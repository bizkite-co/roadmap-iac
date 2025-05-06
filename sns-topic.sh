

aws sns create-topic --name site-down --profile mark

aws sts get-caller-identity --profile prs

aws sns get-topic-attributes --topic-arn arn:aws:sns:us-west-1:318364255844:site-down
--profile mark

aws sns set-topic-attributes --topic-arn arn:aws:sns:us-west-1:318364255844:site-down --attribute-name Policy --attribute-value '{"Version":"2008-10-17","Id":"__default_policy_ID","Statement":[{"Sid":"__default_statement_ID","Effect":"Allow","Principal":{"AWS":"*"},"Action":["SNS:GetTopicAttributes","SNS:SetTopicAttributes","SNS:AddPermission","SNS:RemovePermission","SNS:DeleteTopic","SNS:Subscribe","SNS:ListSubscriptionsByTopic","SNS:Publish"],"Resource":"arn:aws:sns:us-west-1:318364255844:site-down","Condition":{"StringEquals":{"AWS:SourceOwner":"318364255844"}}},{"Sid":"AllowPublishFromPRSAccount","Effect":"Allow","Principal":{"AWS":"arn:aws:iam::865664998993:root"},"Action":"sns:Publish","Resource":"arn:aws:sns:us-west-1:318364255844:site-down"}]}' --profile mark