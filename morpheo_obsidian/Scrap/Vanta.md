(base) infokalash@ik-IdeaPad-5-15ITL05-Ua:~$ VANTA_KEY="umfw95r66z68hf4xgtbhkx9c8p5fy4phbv880mp3qt81qxyve7m0" VANTA_OWNER_EMAIL="pavan.joshi@morpheo.ai" VANTA_REGION="us" bash -c "$(curl -L https://raw.githubusercontent.com/VantaInc/vanta-agent-scripts/main/install-linux.sh)"
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  6047  100  6047    0     0  10571      0 --:--:-- --:--:-- --:--:-- 10590

 Debian detected 
[sudo] password for infokalash: 

Hardware UUID: 90924722-2646-11ec-80f0-84a938469e82

UUID check passed.

* Downloading Vanta Device Monitor
######################################################################### 100.0%

* Ensuring checksums match
Checksums match.

* Installing Vanta Device Monitor. You might be asked for your password...
Selecting previously unselected package vanta.
(Reading database ... 225164 files and directories currently installed.)
Preparing to unpack /tmp/tmp.VC1VEdOJ25/vanta.deb ...
Unpacking vanta (2.15.0) ...
Setting up vanta (2.15.0) ...
Created symlink /etc/systemd/system/vanta.service → /lib/systemd/system/vanta.service.
Created symlink /etc/systemd/system/multi-user.target.wants/vanta.service → /lib/systemd/system/vanta.service.

* Checking registration with Vanta
Attempt 1/5
Succeeded in creating a new osquery client
Computer UUID: 90924722-2646-11ec-80f0-84a938469e82
This agent is registered ✓

Vanta Device Monitor has been installed successfully.
It will run in the background and submit data to Vanta.

You can check the status of Vanta Device Monitor using the "/var/vanta/vanta-cli status" command.
