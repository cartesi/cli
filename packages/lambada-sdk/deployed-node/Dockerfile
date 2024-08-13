FROM ghcr.io/zippiehq/cartesi-lambada:latest

RUN apt-get -y update && apt-get -y install nginx

COPY default /etc/nginx/sites-available/default

COPY nginx-entrypoint.sh /nginx-entrypoint.sh

RUN chmod +x /entrypoint.sh

RUN mkdir -p /data/dev-machine/
ADD ./car-files/machine.car /data/dev-machine/machine.car
ADD ./car-files/chain.car /data/dev-machine/chain.car

CMD bash nginx-entrypoint.sh
