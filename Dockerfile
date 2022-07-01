FROM node:16.9

#sudo docker build -t mindy-bot .
#sudo docker run -i -t mindy-bot

#aws ecr get-login-password --region us-west-1 | docker login --username AWS --password-stdin 191518685251.dkr.ecr.us-west-1.amazonaws.com
#docker tag mindy-bot:latest 191518685251.dkr.ecr.us-west-1.amazonaws.com/mindy-bot:latest
#docker push 191518685251.dkr.ecr.us-west-1.amazonaws.com/mindy-bot:latest

#I think this only has to be done 1 time.
#aws ecr create-repository --repository-name mindy-bot

#aws eks --region us-west-1 update-kubeconfig --name bdm-cluster
#kubectl cluster-info

#kubectl apply -f mindy-bot.yaml
#kubectl get ingress -n mindy-bot

#kubectl get pods
#kubectl describe pod <pod name>

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

#overwrite default environment variables
COPY prod.env .env

CMD [ "npm", "start" ]
