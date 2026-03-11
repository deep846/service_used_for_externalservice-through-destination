using {std as s} from '../db/schema';

service studentService {

    entity student as projection on s.student;

}