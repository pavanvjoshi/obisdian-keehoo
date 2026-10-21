****
```
# check for version
conda --version

# create new conda
conda create --name <env_name> python=<python_version> -y
conda create -n myenv python=3.11 -y

# activate conda
conda activate <name>

# deactivate conda
conda deactivate

# delete specific environment
conda remove --name <env_name> --all

# conda env list
conda env list



```



```

find . -type d -name "__pycache__"

find . -type d -name "__pycache__" -exec rm -r {} +

find . -name "__pycache__" -type d -exec rm -r {} + -o -name "*.pyc" -delete
```