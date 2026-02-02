for file in /mongo_seed/data/*
do
  mongoimport --host mementos-mongodb --db dev \
    --type json --file $file \
    --jsonArray --mode=insert
done