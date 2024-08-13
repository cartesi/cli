#!/bin/bash

bash /entrypoint.sh & 
service nginx start 
while true; do sleep 1d; done
