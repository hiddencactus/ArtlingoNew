import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

mongo_uri = os.environ["MONGODB_URI"]
db_name = os.environ["MONGODB_SANDBOX_DB_NAME"]

client = MongoClient(mongo_uri)
db = client[db_name]

users_collection = db["users"]