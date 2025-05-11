# Manually install an SSL certificate on my Apache server (Ubuntu)

Not the right server type? Go back to the [list of installation instructions.](https://www.godaddy.com/help/manually-install-an-ssl-certificate-on-my-server-16623)

After your [certificate request](https://www.godaddy.com/help/generate-a-csr-certificate-signing-request-5343) is approved, you can [download your certificate](https://www.godaddy.com/help/download-my-ssl-certificate-files-4754) from the SSL manager and install it on your Apache server. If your server is running CentOS instead of Ubuntu, please see [Manually install an SSL certificate on my Apache server (CentOS)](https://www.godaddy.com/help/manually-install-an-ssl-certificate-on-my-apache-server-centos-5238).

1.  Find the directory on your server where certificate and key files are stored, then upload your intermediate certificate (`gd_bundle.crt` or similar) and primary certificate (`.crt` file with randomized name) into that folder.

*   For security, you should make these files readable by root only.

2.  Find your Apache configuration file.

*   On default configurations, you can find a file named `apache2.conf` in the `/etc/apache2` folder.
*   If you have configured your server differently, you may be able to find the file with the following command:

grep -i -r "SSLCertificateFile" /etc/apache2/

*   `/etc/apache2/` may be replaced with the base directory of your Apache installation.

3.  Open this file with your favorite text editor.
4.  Inside your `apache2.conf` file, find the < VirtualHost > block.
5.  To have your site available on both secure (https) and non-secure (http) connections, make a copy of this block and paste it directly below the existing < VirtualHost > block.
6.  You can now customize this copy of the < VirtualHost > block for secure connections. Here is an example configuration:

<VirtualHost xxx.xxx.x.x:443>
	DocumentRoot /var/www/coolexample
	ServerName coolexample.com www.coolexample.com
		SSLEngine on
		SSLCertificateFile /path/to/coolexample.crt
		SSLCertificateKeyFile /path/to/privatekey.key
		SSLCertificateChainFile /path/to/intermediate.crt
</VirtualHost>

*   Don't forget the added `443` port at the end of your server IP.
*   **DocumentRoot** and **ServerName** should match your original < VirtualHost > block.
*   The remaining`/path/to/...` file locations can be replaced with your custom directory and file names.

7.  First, run the following command to check your Apache configuration file for errors:

apache2ctl configtest

8.  Confirm that the test returns a **Syntax OK** response. If it does not, review your configuration files.

 **Warning:** The Apache service will not start again if your config files have syntax errors.

9.  After confirming a **Syntax OK** response, run the following command to restart Apache:

apache2ctl restart

## Next step

*   To continue installing the SSL certificate, proceed with [Redirect HTTP to HTTPS automatically](https://www.godaddy.com/help/redirect-http-to-https-automatically-8828).

 **Note:** As a courtesy, we provide information about how to use certain third-party products, but we do not endorse or directly support third-party products and we are not responsible for the functions or reliability of such products. Third-party marks and logos are registered trademarks of their respective owners. All rights reserved.